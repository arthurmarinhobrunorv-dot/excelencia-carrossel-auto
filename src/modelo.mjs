// Monta o HTML do carrossel a partir do roteiro que o Claude escreveu.
// Estilo: o mesmo do carrossel do Outubro Rosa (Inter, azul e magenta do logo do portal), 1080x1350.

const esc = (s = '') => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Destaca um trecho do título em cor (se o trecho existir no título)
function realce(titulo = '', destaque = '') {
  const t = esc(titulo);
  const d = esc(destaque).trim();
  return d && t.includes(d) ? t.replace(d, `<em>${d}</em>`) : t;
}

const MATHSEO_ESCURO = `<span class="mathseo"><svg viewBox="4 2 41 40" aria-hidden="true"><defs><linearGradient id="mathseo-g" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="40"><stop offset=".35" stop-color="#E4FF3A"/><stop offset="1" stop-color="#FF5C39"/></linearGradient></defs><path d="M8 38V12l16 18 16-18v26" fill="none" stroke="url(#mathseo-g)" stroke-width="4.4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="40" cy="6.5" r="3" fill="url(#mathseo-g)"/></svg>Design por MathSeo</span>`;

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--navy:#082A45;--magenta:#9B2061;--rosa:#EE6AA7;--claro:#F1F4F8;--branco:#FAFAF7;--corpo:#3D4B5C}
body{background:#d9d9d9;font-family:Inter,sans-serif;display:flex;flex-direction:column;align-items:center;gap:40px;padding:40px 0;-webkit-font-smoothing:antialiased}
.slide{--e:1;width:1080px;height:1350px;position:relative;overflow:hidden;display:flex;flex-direction:column;padding:72px 84px}
.dark{background:var(--navy);color:var(--branco)}
.light{background:var(--claro);color:var(--navy)}
.mag{background:var(--magenta);color:var(--branco)}
.conteudo{flex:1;min-height:0;display:flex;flex-direction:column;position:relative;z-index:2;overflow:hidden}

.topo{display:flex;justify-content:space-between;align-items:center;position:relative;z-index:2;min-height:58px;flex:none}
.topo img{height:58px;display:block}
.contador{font-size:16px;font-weight:600;letter-spacing:.18em}
.dark .contador,.mag .contador{color:rgba(250,250,247,.7)}
.light .contador{color:rgba(8,42,69,.6)}

.kicker{font-size:15px;font-weight:800;letter-spacing:.26em;text-transform:uppercase}
.dark .kicker{color:var(--rosa)}
.light .kicker{color:var(--magenta)}
.mag .kicker{color:var(--branco)}
.regua{width:72px;height:4px;border-radius:2px;margin:26px 0 30px;flex:none}
.dark .regua{background:var(--rosa)}
.light .regua{background:var(--magenta)}
.mag .regua{background:var(--branco)}

h1{font-size:calc(84px*var(--e));font-weight:900;line-height:1;letter-spacing:-.04em}
h2{font-size:calc(60px*var(--e));font-weight:800;line-height:1.05;letter-spacing:-.035em}
p{font-size:calc(24px*var(--e));font-weight:500;line-height:1.5}
.dark p{color:rgba(250,250,247,.82)}
.light p{color:var(--corpo)}
em{font-style:normal}
.dark em{color:var(--rosa)}
.light em{color:var(--magenta)}

.credito{font-size:13px;font-weight:500;letter-spacing:.03em;margin-top:12px;flex:none}
.dark .credito{color:rgba(250,250,247,.55)}
.light .credito{color:rgba(8,42,69,.55)}
.rodape{display:flex;justify-content:space-between;align-items:center;padding-top:24px;font-size:17px;font-weight:600;flex:none;position:relative;z-index:2;gap:24px}
.dark .rodape{border-top:1px solid rgba(255,255,255,.12)}

.foto{border-radius:20px;background-size:cover;background-position:center 30%;width:100%;flex:1;min-height:300px}
.bloco{margin-top:56px}

/* capa e foto grande */
.foto-topo{position:absolute;top:0;left:0;right:0;background-size:cover;background-position:center 30%}
.foto-topo::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(8,42,69,.7) 0%,rgba(8,42,69,0) 20%,rgba(8,42,69,0) 45%,rgba(8,42,69,.85) 82%,var(--navy) 100%)}
.capa .foto-topo{height:820px}
.fotogrande .foto-topo{height:640px}
.embaixo{margin-top:auto}
.tag{display:inline-block;align-self:flex-start;padding:12px 22px;border-radius:999px;background:var(--rosa);color:var(--navy);font-size:15px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;margin-bottom:30px}
.capa h1{margin-bottom:28px}
.capa p{max-width:880px;margin-bottom:40px}
.arraste{color:var(--rosa)}

/* lista */
.lista{list-style:none;margin:44px 0 0}
.lista li{display:flex;align-items:baseline;gap:30px;padding:calc(34px*var(--e)) 0;border-top:1px solid rgba(255,255,255,.12)}
.lista li:last-child{border-bottom:1px solid rgba(255,255,255,.12)}
.lista span{font-size:17px;font-weight:700;letter-spacing:.18em;color:var(--rosa);width:34px;flex:none}
.lista strong{font-size:calc(50px*var(--e));font-weight:700;letter-spacing:-.025em;line-height:1.15}
.fim{margin-top:auto;padding-top:32px}

/* citação */
.meio{flex:1;display:flex;flex-direction:column;justify-content:center}
.aspas{font-family:Georgia,'Times New Roman',serif;font-size:300px;font-weight:700;line-height:.7;color:var(--rosa);height:150px;margin:0 0 56px -8px;flex:none}
.citacao h2{font-size:calc(62px*var(--e))}
.autor{display:flex;align-items:center;gap:26px}
.avatar{width:132px;height:132px;border-radius:50%;background-size:cover;background-position:center 25%;border:3px solid var(--rosa);flex:none}
.autor b{display:block;font-size:26px;font-weight:700;letter-spacing:-.01em}
.autor small{display:block;font-size:18px;font-weight:500;margin-top:4px;color:rgba(250,250,247,.7)}

/* número */
.numero{display:flex;align-items:flex-end;flex-wrap:wrap;color:var(--magenta);font-weight:800;letter-spacing:-.05em;line-height:.85;margin:30px 0 30px;gap:0 16px}
.numero .pre{font-size:84px;align-self:flex-start;margin-top:26px;letter-spacing:-.03em}
.numero .val{font-size:calc(280px*var(--e))}
.numero .suf{font-size:120px;margin-bottom:18px;letter-spacing:-.04em}

/* final */
.final .conteudo{align-items:center;justify-content:center;text-align:center}
.final .logo-cta{width:330px;margin-bottom:64px}
.final .regua{margin:26px auto 34px}
.final h2{font-size:calc(80px*var(--e));font-weight:900;letter-spacing:-.04em;line-height:1;margin-bottom:34px}
.final p{color:rgba(250,250,247,.9);max-width:800px;margin-bottom:46px}
.botao{display:inline-block;padding:24px 42px;border-radius:999px;background:var(--branco);color:var(--navy);font-size:22px;font-weight:700}
.handle{margin-top:26px;font-size:18px;font-weight:600;color:rgba(250,250,247,.85)}
.mag .rodape{border-top:1px solid rgba(255,255,255,.25);font-size:14px;color:rgba(250,250,247,.85)}

.mathseo{display:inline-flex;align-items:center;gap:.45em;white-space:nowrap;text-transform:none}
.mathseo svg{width:1.2em;height:1.2em;flex:none}
`;

// Diminui a letra do slide aos poucos se o texto não couber
const AJUSTE = `
for (const s of document.querySelectorAll('.slide')) {
  const c = s.querySelector('.conteudo');
  let e = 1;
  while (c && c.scrollHeight > c.clientHeight + 1 && e > 0.62) { e -= 0.03; s.style.setProperty('--e', e); }
}`;

export function montarHtml(roteiro, fotos) {
  const total = roteiro.slides.length;
  const url = i => (Number.isInteger(i) && fotos[i] ? `fotos/${fotos[i].arquivo}` : null);
  const cred = i => {
    const f = Number.isInteger(i) && fotos[i];
    const jaTemCredito = /foto|cr[ée]dito|divulga/i.test(f?.legenda || '');
    const txt = [f?.legenda, !jaTemCredito && roteiro.credito_fotos && `Foto: ${roteiro.credito_fotos}`].filter(Boolean).join(' · ');
    return txt ? `<div class="credito">${esc(txt)}</div>` : '';
  };
  const topo = (n, tema) => `<div class="topo"><img src="../../assets/logo-excelencia-${tema === 'light' ? 'cor' : 'branco'}.svg" alt="Portal Excelência Notícias"><span class="contador">${String(n).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span></div>`;
  const cabeca = s => `${s.kicker ? `<span class="kicker">${esc(s.kicker)}</span><div class="regua"></div>` : ''}`;

  const slides = roteiro.slides.map((s, i) => {
    const n = i + 1;
    const f = url(s.foto);
    switch (s.tipo) {
      case 'capa':
        return `<div class="slide dark capa">${f ? `<div class="foto-topo" style="background-image:url('${f}')"></div>` : ''}
  ${topo(n, 'dark')}
  <div class="conteudo"><div class="embaixo">
    ${s.kicker ? `<span class="tag">${esc(s.kicker)}</span>` : ''}
    <h1>${realce(s.titulo, s.destaque)}</h1>
    ${s.texto ? `<p>${esc(s.texto)}</p>` : ''}
  </div></div>
  <div class="rodape"><span>@excelencianoticias</span><span class="arraste">Arraste para o lado →</span></div>
</div>`;

      case 'foto':
        return `<div class="slide dark fotogrande">${f ? `<div class="foto-topo" style="background-image:url('${f}')"></div>` : ''}
  ${topo(n, 'dark')}
  <div class="conteudo"><div class="embaixo">
    ${cabeca(s)}
    <h2 style="margin-bottom:28px">${realce(s.titulo, s.destaque)}</h2>
    ${s.texto ? `<p>${esc(s.texto)}</p>` : ''}
  </div></div>
  ${f ? `<div class="rodape" style="padding-top:0">${cred(s.foto)}</div>` : ''}
</div>`;

      case 'lista':
        return `<div class="slide dark">
  ${topo(n, 'dark')}
  <div class="conteudo"><div class="bloco">
    ${cabeca(s)}
    <h2>${realce(s.titulo, s.destaque)}</h2>
  </div>
  <ul class="lista">${(s.itens || []).map((it, k) => `<li><span>${String(k + 1).padStart(2, '0')}</span><strong>${esc(it)}</strong></li>`).join('')}</ul>
  ${s.texto ? `<p class="fim">${esc(s.texto)}</p>` : ''}
  </div>
</div>`;

      case 'citacao':
        return `<div class="slide dark citacao">
  ${topo(n, 'dark')}
  <div class="conteudo"><div class="meio">
    <div class="aspas">“</div>
    ${cabeca(s)}
    <h2>“${realce(s.titulo, s.destaque)}”</h2>
    ${s.texto ? `<p style="margin-top:34px">${esc(s.texto)}</p>` : ''}
  </div></div>
  <div class="rodape" style="padding-top:36px">
    <div class="autor">${f ? `<div class="avatar" style="background-image:url('${f}')"></div>` : ''}<div><b>${esc(s.autor)}</b>${s.cargo ? `<small>${esc(s.cargo)}</small>` : ''}</div></div>
  </div>
</div>`;

      case 'numero':
        return `<div class="slide light">
  ${topo(n, 'light')}
  <div class="conteudo"><div class="bloco">
    ${s.kicker ? `<span class="kicker">${esc(s.kicker)}</span>` : ''}
    <div class="numero">${s.prefixo ? `<span class="pre">${esc(s.prefixo)}</span>` : ''}<span class="val">${esc(s.numero)}</span>${s.sufixo ? `<span class="suf">${esc(s.sufixo)}</span>` : ''}</div>
    <h2>${realce(s.titulo, s.destaque)}</h2>
  </div>
  ${s.texto ? `<p class="fim">${esc(s.texto)}</p>` : ''}
  </div>
</div>`;

      case 'final':
        return `<div class="slide mag final">
  <div class="topo"><span></span><span class="contador">${String(n).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span></div>
  <div class="conteudo">
    <img class="logo-cta" src="../../assets/logo-excelencia-branco.svg" alt="Portal Excelência Notícias">
    ${cabeca(s)}
    <h2>${esc(s.titulo)}</h2>
    ${s.texto ? `<p>${esc(s.texto)}</p>` : ''}
    <span class="botao">Matéria completa no link da bio</span>
    <span class="handle">@excelencianoticias · excelencianoticias.com.br</span>
  </div>
  <div class="rodape"><span>${roteiro.reportagem ? `Reportagem: ${esc(roteiro.reportagem)}` : 'Portal Excelência Notícias'}</span>${MATHSEO_ESCURO}</div>
</div>`;

      default: // 'texto': fundo claro, título, texto e foto opcional
        return `<div class="slide light">
  ${topo(n, 'light')}
  <div class="conteudo"><div class="bloco">
    ${cabeca(s)}
    <h2>${realce(s.titulo, s.destaque)}</h2>
    ${s.texto ? `<p style="margin-top:30px">${esc(s.texto)}</p>` : ''}
  </div>
  ${f ? `<div class="bloco" style="flex:1;display:flex;flex-direction:column;margin-top:48px;min-height:0"><div class="foto" style="background-image:url('${f}')"></div>${cred(s.foto)}</div>` : ''}
  </div>
</div>`;
    }
  });

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(roteiro.slides[0]?.titulo || 'Carrossel')} — Excelência Notícias</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
${slides.join('\n\n')}
</body>
</html>`;
}

export const SCRIPT_AJUSTE = AJUSTE;
