# Carrossel automático — Excelência Notícias

Toda matéria nova em excelencianoticias.com.br vira um carrossel no Instagram @excelencianoticias, sozinho.

```
cron-job.org (de hora em hora)
   └─> dispara o GitHub Actions deste repositório
         ├─ consulta o site (API do WordPress) → tem matéria nova?
         ├─ baixa as fotos da matéria
         ├─ Claude escreve o roteiro dos slides + legenda (só com fatos da matéria)
         ├─ renderiza os slides 1080x1350 (JPEG) e salva em posts/
         └─ publica o carrossel no Instagram (API oficial da Meta)
```

- `estado.json` guarda as matérias que já viraram carrossel (nunca posta duas vezes).
- **Cores variam (pedido do cliente, 20/11/2026):** cada carrossel usa uma das 6 paletas de `src/modelo.mjs` (`portal`, `verde`, `vinho`, `petroleo`, `terracota`, `royal`). O Claude escolhe pela cara da matéria e nunca repete a do carrossel anterior (`ultimaPaleta` no `estado.json`); se ele não escolher, vai a próxima do rodízio. A logo do portal não muda. Paleta nova: acrescentar em `PALETAS`, com o `uso` explicando os temas.
- Matéria com mais de 2 dias é ignorada. No máximo 3 carrosséis por rodada.
- Se der erro, tenta de novo na próxima rodada (até 3 vezes) e o GitHub manda e-mail avisando.
- Sem a chave do Claude, o robô só espera. Sem as chaves do Instagram, ele roda em **rascunho**: faz os slides e salva em `posts/`, mas não publica.

## Configuração (uma vez só)

### 1. Segredos do repositório

Settings → Secrets and variables → Actions → **New repository secret**

| Segredo | O que é |
|---|---|
| `ANTHROPIC_API_KEY` | chave da API do Claude (console.anthropic.com) |
| `IG_ACCESS_TOKEN` | token da Meta com `instagram_basic`, `instagram_content_publish`, `pages_show_list` |
| `IG_USER_ID` | ID da conta Instagram profissional do jornal |

Variáveis (aba **Variables**, opcionais): `MODO` = `rascunho` ou `publicar`; `CLAUDE_MODEL` (padrão `claude-sonnet-5-5`).

**Token do Instagram que não vence:** a conta @excelencianoticias precisa ser profissional (empresa ou criador) e ligada a uma Página do Facebook.
No business.facebook.com → Configurações → Usuários do sistema → criar um usuário do sistema (admin), dar acesso ao app e à Página,
e gerar o token com as permissões acima e validade **Nunca**. Token comum de usuário vence em 60 dias e o robô para de postar.
O `IG_USER_ID` sai de `GET /me/accounts?fields=instagram_business_account` no Graph API Explorer.

### 2. cron-job.org (o que mantém tudo rodando)

1. No GitHub: Settings (da conta) → Developer settings → Personal access tokens → **Fine-grained** → acesso só a este repositório, permissão **Actions: Read and write**, validade a maior possível
2. No console.cron-job.org → **Create cronjob**:
   - URL: `https://api.github.com/repos/arthurmarinhobrunorv-dot/excelencia-carrossel-auto/actions/workflows/carrossel.yml/dispatches`
   - Agenda: a cada 60 minutos
   - Advanced → Request method: **POST**
   - Headers:
     - `Authorization: Bearer <token do passo 1>`
     - `Accept: application/vnd.github+json`
     - `X-GitHub-Api-Version: 2022-11-28`
   - Request body: `{"ref":"main"}`
   - Resposta esperada: **204** (sucesso)

O agendamento interno do GitHub fica como reserva (a cada 3 horas). Ele atrasa e é desligado depois de 60 dias
sem atividade no repositório; o disparo do cron-job.org não tem esse limite.

## Uso no dia a dia

- **Refazer uma matéria:** Actions → Carrossel automático → Run workflow → `post_id` = ID da matéria
  (aparece no WordPress, ou em `posts/<pasta>/roteiro.json`)
- **Pausar a publicação:** variável `MODO` = `rascunho`
- **Ver o que foi feito:** pasta `posts/` (slides, legenda e roteiro) e `estado.json` → `publicados` (com o link do post)
- **Mudar o visual:** `src/modelo.mjs`. **Mudar as regras de texto:** `INSTRUCOES` em `src/rodar.mjs`

Design por MathSeo.
