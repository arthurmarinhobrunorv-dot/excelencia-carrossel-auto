// Robô do Excelência Notícias: acha matéria nova no site, escreve o carrossel com o Claude,
// renderiza os slides e publica no Instagram.
//
//   node src/rodar.mjs --checar     só diz quantas matérias novas tem (não muda nada)
//   node src/rodar.mjs              faz os carrosséis das matérias novas
//   node src/rodar.mjs --post 12345 refaz o carrossel de uma matéria específica
//
// Variáveis: ANTHROPIC_API_KEY, IG_ACCESS_TOKEN, IG_USER_ID, MODO (publicar | rascunho)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { montarHtml, SCRIPT_AJUSTE } from './modelo.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE_URL || 'https://excelencianoticias.com.br';
const MODELO_IA = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const IG_HOST = process.env.IG_API_HOST || 'graph.facebook.com';
const IG_VERSAO = process.env.IG_API_VERSAO || 'v24.0';
const MAX_POR_RODADA = 3;
const MAX_TENTATIVAS = 3;
const NO_GITHUB = !!process.env.GITHUB_ACTIONS;

const args = process.argv.slice(2);
const arg = nome => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] ?? true : null; };
const temIg = !!(process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID);
const MODO = (process.env.MODO || (temIg ? 'publicar' : 'rascunho')).trim();

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sh = cmd => execSync(cmd, { cwd: RAIZ, stdio: 'pipe' }).toString().trim();

// ---------- estado (quais matérias já viraram carrossel) ----------
const ARQ_ESTADO = join(RAIZ, 'estado.json');
async function lerEstado() {
  return existsSync(ARQ_ESTADO) ? JSON.parse(await readFile(ARQ_ESTADO, 'utf8')) : { desde: null, vistos: [], falhas: {}, publicados: [] };
}
const salvarEstado = e => writeFile(ARQ_ESTADO, JSON.stringify(e, null, 2) + '\n');

// ---------- site (WordPress) ----------
async function wp(caminho) {
  const r = await fetch(SITE + caminho, { headers: { 'User-Agent': 'MathSeo-carrossel/1.0' } });
  if (!r.ok) throw new Error(`Site respondeu ${r.status} em ${caminho}`);
  return r.json();
}
const ultimosPosts = () => wp('/wp-json/wp/v2/posts?per_page=10&_embed=1');
const umPost = id => wp(`/wp-json/wp/v2/posts/${id}?_embed=1`);

const semTags = html => html
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h\d|li|figcaption|blockquote)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—')
  .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').replace(/&#8216;|&#8217;|&rsquo;|&lsquo;/g, "'")
  .replace(/&#8230;/g, '…').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();

export function lerMateria(p) {
  const html = p.content?.rendered || '';
  const fotos = [];
  const add = (url, legenda = '') => {
    if (!url || /\.(gif|svg)(\?|$)/i.test(url) || fotos.some(f => f.url === url)) return;
    const leg = semTags(legenda);
    fotos.push({ url, legenda: leg.length > 160 ? leg.slice(0, 160).replace(/\s+\S*$/, '') + '…' : leg });
  };
  const destaque = p._embedded?.['wp:featuredmedia']?.[0];
  if (destaque?.source_url) add(destaque.source_url, destaque.caption?.rendered || '');
  // Fotos do corpo da matéria, com a legenda da figura quando tiver
  for (const m of html.matchAll(/<figure[\s\S]*?<\/figure>|<img[^>]*>/gi)) {
    const bloco = m[0];
    const src = bloco.match(/<img[^>]*?\ssrc="([^"]+)"/i)?.[1];
    const legenda = bloco.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || '';
    add(src, legenda);
  }
  const categorias = (p._embedded?.['wp:term']?.[0] || []).map(t => t.name).filter(n => !/sem categoria/i.test(n));
  return {
    id: p.id,
    titulo: semTags(p.title?.rendered || ''),
    data: p.date,
    link: p.link,
    slug: p.slug,
    categorias,
    texto: semTags(html).slice(0, 14000),
    fotos: fotos.slice(0, 8),
  };
}

// ---------- roteiro (Claude) ----------
const FERRAMENTA = {
  name: 'montar_carrossel',
  description: 'Entrega o roteiro do carrossel de Instagram e a legenda do post.',
  input_schema: {
    type: 'object',
    required: ['slides', 'legenda', 'hashtags'],
    properties: {
      slides: {
        type: 'array', minItems: 5, maxItems: 8,
        description: 'Primeiro slide sempre "capa", último sempre "final". Entre eles, 3 a 6 slides variando os tipos conforme o conteúdo pedir.',
        items: {
          type: 'object', required: ['tipo', 'titulo'],
          properties: {
            tipo: { type: 'string', enum: ['capa', 'texto', 'foto', 'lista', 'citacao', 'numero', 'final'],
              description: 'capa: foto grande + manchete. texto: título + parágrafo (+ foto opcional). foto: foto grande + título curto. lista: 3 a 5 itens curtos. citacao: frase dita por alguém na matéria, entre aspas no original. numero: um número marcante da matéria. final: chamada para a matéria completa.' },
            kicker: { type: 'string', description: 'Rótulo curto em caixa alta, até 28 caracteres. Na capa: editoria · cidade (ex: "Saúde · Niquelândia").' },
            titulo: { type: 'string', description: 'capa: manchete de até 75 caracteres. demais: até 80 caracteres. citacao: só a frase, sem aspas, copiada da matéria, até 120 caracteres.' },
            destaque: { type: 'string', description: 'Trecho exato do título (2 a 5 palavras) que ganha cor. Opcional.' },
            texto: { type: 'string', description: 'Parágrafo de apoio. capa: até 140 caracteres. texto/foto: até 320. lista/numero/citacao: até 220. final: até 140.' },
            itens: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'Só no tipo lista. Cada item até 60 caracteres.' },
            prefixo: { type: 'string', description: 'Só no tipo numero. Ex: "R$". Opcional.' },
            numero: { type: 'string', description: 'Só no tipo numero. Só os dígitos, até 4 caracteres. Ex: "30", "154", "75%".' },
            sufixo: { type: 'string', description: 'Só no tipo numero. Ex: "mil", "cidades". Até 10 caracteres. Opcional.' },
            autor: { type: 'string', description: 'Só no tipo citacao: nome de quem falou.' },
            cargo: { type: 'string', description: 'Só no tipo citacao: cargo de quem falou.' },
            foto: { type: 'integer', description: 'Índice da foto da matéria (0 = foto de capa). Use -1 para sem foto. Na capa, use a foto mais forte. Só use foto de pessoa no tipo citacao se a foto for claramente dessa pessoa.' },
          },
        },
      },
      legenda: { type: 'string', description: 'Legenda do post: 2 a 4 parágrafos curtos resumindo a notícia, terminando com "Arraste para o lado e confira os detalhes." Sem hashtags, sem emoji, sem link.' },
      hashtags: { type: 'array', items: { type: 'string' }, maxItems: 14, description: 'Hashtags sem o #, sem acento. Incluir a cidade, a região (NorteDeGoias, Goias) e ExcelenciaNoticias.' },
      reportagem: { type: 'string', description: 'Nome do autor da reportagem, se a matéria disser. Senão, vazio.' },
      credito_fotos: { type: 'string', description: 'Crédito das fotos como aparece na matéria (ex: "Patrícia Bastos / Especial para o Excelência Notícias", "Divulgação"). Senão, vazio.' },
    },
  },
};

const INSTRUCOES = `Você é editor de redes sociais do Portal Excelência Notícias (@excelencianoticias), jornal do Norte de Goiás (sede em Niquelândia - GO).
Transforme a matéria em um carrossel de Instagram fiel ao texto original.

Regras inegociáveis:
- Use só fatos que estão na matéria. Não invente número, nome, cargo, data, local nem frase.
- Citação só se a pessoa disse aquilo na matéria (entre aspas no original). Copie as palavras como estão. Se não houver citação, não use o tipo citacao.
- Nomes, cargos e partidos exatamente como na matéria.
- Português correto, tom jornalístico, direto e claro. Frases curtas. Sem emoji, sem exagero, sem sensacionalismo.
- Datas relativas como na matéria ("no sábado (24)").
- Matéria triste (morte, acidente, crime): tom sóbrio, sem destaque colorido apelativo, e o slide final pede para acompanhar o portal, sem frases motivacionais.
- Cada slide conta uma parte da notícia; não repita a mesma informação em dois slides.
- Respeite os limites de caracteres de cada campo: o texto precisa caber no slide.`;

async function escreverRoteiro(m) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY');
  const listaFotos = m.fotos.map((f, i) => `${i}: ${f.legenda || '(sem legenda)'}`).join('\n') || '(matéria sem fotos)';
  const pedido = `Matéria publicada em ${m.data.slice(0, 10)} — ${m.link}
Editorias: ${m.categorias.join(', ') || '—'}

TÍTULO: ${m.titulo}

TEXTO:
${m.texto}

FOTOS DISPONÍVEIS (índice: legenda) — as imagens vêm acima, na mesma ordem:
${listaFotos}`;

  const chamar = async comImagens => {
    const conteudo = [
      ...(comImagens ? m.fotos.slice(0, 6).map(f => ({ type: 'image', source: { type: 'url', url: f.url } })) : []),
      { type: 'text', text: pedido },
    ];
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_IA, max_tokens: 6000, system: INSTRUCOES,
        tools: [FERRAMENTA], tool_choice: { type: 'tool', name: FERRAMENTA.name },
        messages: [{ role: 'user', content: conteudo }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Claude: ${j.error?.message || r.status}`);
    const uso = j.content.find(c => c.type === 'tool_use');
    if (!uso) throw new Error('Claude não devolveu o roteiro');
    return uso.input;
  };

  let roteiro;
  try { roteiro = await chamar(m.fotos.length > 0); }
  catch (e) {
    if (!m.fotos.length) throw e;
    log('  falhou com imagens, tentando só com texto:', e.message);
    roteiro = await chamar(false);
  }
  // Garante capa no começo e final no fim, e no máximo 10 slides (limite do Instagram)
  const s = roteiro.slides.filter(x => x && x.titulo);
  if (s[0]?.tipo !== 'capa') s.unshift({ tipo: 'capa', titulo: m.titulo.slice(0, 90), foto: 0 });
  if (s.at(-1)?.tipo !== 'final') s.push({ tipo: 'final', titulo: 'Acompanhe o Excelência Notícias', texto: 'Notícias do Norte de Goiás todos os dias.' });
  roteiro.slides = s.slice(0, 9).concat(s.length > 10 ? [s.at(-1)] : s.slice(9));
  return roteiro;
}

// ---------- fotos e renderização ----------
export async function baixarFotos(m, pasta) {
  await mkdir(join(pasta, 'fotos'), { recursive: true });
  for (const [i, f] of m.fotos.entries()) {
    try {
      const r = await fetch(f.url, { headers: { 'User-Agent': 'MathSeo-carrossel/1.0' } });
      if (!r.ok) throw new Error(r.status);
      const ext = (f.url.match(/\.(jpe?g|png|webp)(\?|$)/i)?.[1] || 'jpg').toLowerCase();
      f.arquivo = `${String(i).padStart(2, '0')}.${ext}`;
      await writeFile(join(pasta, 'fotos', f.arquivo), Buffer.from(await r.arrayBuffer()));
    } catch (e) { log(`  foto ${i} não baixou (${e.message})`); }
  }
}

export async function renderizar(pasta) {
  const { chromium } = await import('playwright');
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });
  await pagina.goto(pathToFileURL(join(pasta, 'carrossel.html')).href, { waitUntil: 'networkidle' });
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.evaluate(SCRIPT_AJUSTE);
  const saida = join(pasta, 'instagram');
  await mkdir(saida, { recursive: true });
  const arquivos = [];
  for (const [i, s] of (await pagina.$$('.slide')).entries()) {
    const nome = `slide-${String(i + 1).padStart(2, '0')}.jpg`; // a API do Instagram só aceita JPEG
    await s.screenshot({ path: join(saida, nome), type: 'jpeg', quality: 92 });
    arquivos.push(nome);
  }
  await navegador.close();
  return arquivos;
}

export function montarLegenda(roteiro, m) {
  const tags = [...new Set((roteiro.hashtags || []).map(t => t.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean))].slice(0, 14);
  if (!tags.includes('ExcelenciaNoticias')) tags.push('ExcelenciaNoticias');
  const credito = [roteiro.reportagem && `Reportagem: ${roteiro.reportagem}`, roteiro.credito_fotos && `Fotos: ${roteiro.credito_fotos}`].filter(Boolean).join(' · ');
  return [
    roteiro.legenda.trim(),
    'A matéria completa está no link da bio e em excelencianoticias.com.br. Siga @excelencianoticias e acompanhe o dia a dia do Norte de Goiás.',
    credito,
    tags.map(t => '#' + t).join(' '),
  ].filter(Boolean).join('\n\n').slice(0, 2200);
}

// ---------- GitHub (as imagens precisam de link público pro Instagram buscar) ----------
function enviarProGithub(mensagem) {
  if (!NO_GITHUB) return null;
  sh('git add -A posts estado.json');
  if (!sh('git status --porcelain posts estado.json')) return sh('git rev-parse HEAD');
  sh(`git commit -m "${mensagem.replace(/"/g, "'")}"`);
  sh('git pull --rebase -q origin HEAD');
  sh('git push -q origin HEAD');
  return sh('git rev-parse HEAD');
}

async function esperarNoAr(url) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (r?.ok) return;
    await new Promise(ok => setTimeout(ok, 3000));
  }
  throw new Error(`Imagem não ficou acessível: ${url}`);
}

// ---------- Instagram (API oficial da Meta) ----------
async function ig(caminho, params = {}, metodo = 'POST') {
  const url = new URL(`https://${IG_HOST}/${IG_VERSAO}${caminho}`);
  const corpo = new URLSearchParams({ ...params, access_token: process.env.IG_ACCESS_TOKEN });
  const r = metodo === 'GET'
    ? await fetch(`${url}?${corpo}`)
    : await fetch(url, { method: 'POST', body: corpo });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`Instagram: ${j.error?.message || r.status}`);
  return j;
}

async function esperarContainer(id) {
  for (let i = 0; i < 40; i++) {
    const { status_code } = await ig(`/${id}`, { fields: 'status_code' }, 'GET');
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Instagram recusou a mídia ${id} (${status_code})`);
    await new Promise(ok => setTimeout(ok, 5000));
  }
  throw new Error(`Instagram demorou demais pra processar ${id}`);
}

async function publicarInstagram(urls, legenda) {
  const user = process.env.IG_USER_ID;
  const filhos = [];
  for (const image_url of urls) {
    const { id } = await ig(`/${user}/media`, { image_url, is_carousel_item: 'true' });
    filhos.push(id);
  }
  for (const id of filhos) await esperarContainer(id);
  const { id: carrossel } = await ig(`/${user}/media`, { media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda });
  await esperarContainer(carrossel);
  const { id: midia } = await ig(`/${user}/media_publish`, { creation_id: carrossel });
  const { permalink } = await ig(`/${midia}`, { fields: 'permalink' }, 'GET').catch(() => ({}));
  return { midia, permalink };
}

// ---------- uma matéria ----------
async function processar(p, estado) {
  const m = lerMateria(p);
  const pasta = join(RAIZ, 'posts', `${m.data.slice(0, 10)}-${m.slug.slice(0, 60)}`);
  log(`Matéria ${m.id}: ${m.titulo}`);
  await mkdir(pasta, { recursive: true });
  await baixarFotos(m, pasta);
  m.fotos = m.fotos.filter(f => f.arquivo);

  log('  escrevendo o roteiro…');
  const roteiro = await escreverRoteiro(m);
  const legenda = montarLegenda(roteiro, m);
  await writeFile(join(pasta, 'carrossel.html'), montarHtml(roteiro, m.fotos));
  await writeFile(join(pasta, 'roteiro.json'), JSON.stringify({ materia: { ...m, texto: undefined }, roteiro }, null, 2));
  await writeFile(join(pasta, 'legenda.txt'), legenda + '\n');

  log('  renderizando…');
  const slides = await renderizar(pasta);
  log(`  ${slides.length} slides prontos`);

  const sha = enviarProGithub(`carrossel: ${m.titulo.slice(0, 70)}`);
  const registro = { id: m.id, titulo: m.titulo, link: m.link, pasta: pasta.slice(RAIZ.length + 1).replace(/\\/g, '/'), feito: new Date().toISOString(), modo: MODO };

  if (MODO === 'publicar') {
    if (!temIg) throw new Error('MODO=publicar mas faltam IG_ACCESS_TOKEN / IG_USER_ID');
    if (!sha) throw new Error('Publicar só funciona rodando no GitHub Actions (as imagens precisam de link público)');
    const base = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/${sha}/${registro.pasta.split('/').map(encodeURIComponent).join('/')}/instagram`;
    const urls = slides.map(s => `${base}/${s}`);
    await esperarNoAr(urls[0]);
    log('  publicando no Instagram…');
    Object.assign(registro, await publicarInstagram(urls, legenda));
    log(`  publicado: ${registro.permalink || registro.midia}`);
  } else {
    log('  modo rascunho: não publicou no Instagram');
  }
  estado.publicados.push(registro);
}

// ---------- rodada ----------
async function main() {
  const estado = await lerEstado();
  const forcar = arg('--post');

  if (forcar && forcar !== true) {
    await processar(await umPost(forcar), estado);
    if (!estado.vistos.includes(Number(forcar))) estado.vistos.push(Number(forcar));
    await salvarEstado(estado);
    enviarProGithub(`estado: matéria ${forcar}`);
    return;
  }

  const posts = await ultimosPosts();
  // Primeira vez: marca o que já está no site como visto, pra não postar matéria antiga
  if (!estado.desde) {
    estado.desde = posts[0]?.date || new Date().toISOString();
    estado.vistos = posts.map(p => p.id);
    await salvarEstado(estado);
    log(`Primeira rodada: ${posts.length} matérias já existentes marcadas como vistas.`);
    enviarProGithub('estado: início');
    return;
  }

  // Matéria com mais de 2 dias não vira carrossel (evita despejar um acúmulo no feed)
  const velha = p => Date.now() - new Date(p.date_gmt + 'Z') > 2 * 24 * 3600e3;
  const antigas = posts.filter(p => !estado.vistos.includes(p.id) && (p.date <= estado.desde || velha(p)));
  if (antigas.length && !arg('--checar')) {
    estado.vistos.push(...antigas.map(p => p.id));
    log(`${antigas.length} matéria(s) com mais de 2 dias ignorada(s)`);
  }
  const novos = posts.filter(p => !estado.vistos.includes(p.id) && !antigas.includes(p)).reverse(); // mais antiga primeiro
  if (!process.env.ANTHROPIC_API_KEY) {
    log(`${novos.length} matéria(s) nova(s), mas falta a ANTHROPIC_API_KEY. Esperando configurar.`);
    return;
  }
  if (arg('--checar')) {
    log(`${novos.length} matéria(s) nova(s)`);
    if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `novos=${novos.length}\n`, { flag: 'a' });
    return;
  }
  if (!novos.length) return log('Nenhuma matéria nova.');

  let erros = 0;
  for (const p of novos.slice(0, MAX_POR_RODADA)) {
    try {
      await processar(p, estado);
      estado.vistos.push(p.id);
      delete estado.falhas[p.id];
    } catch (e) {
      erros++;
      estado.falhas[p.id] = (estado.falhas[p.id] || 0) + 1;
      console.error(`  ERRO na matéria ${p.id} (tentativa ${estado.falhas[p.id]}/${MAX_TENTATIVAS}): ${e.message}`);
      if (estado.falhas[p.id] >= MAX_TENTATIVAS) { estado.vistos.push(p.id); console.error('  desistindo dessa matéria'); }
    }
    estado.vistos = estado.vistos.slice(-300);
    await salvarEstado(estado);
    enviarProGithub(`estado: matéria ${p.id}`);
  }
  if (erros) process.exit(1); // o GitHub manda e-mail avisando da falha
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
}
