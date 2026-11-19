# Proliferate V2

App pessoal para jogadores de **Magic: The Gathering**, com interface 100% em português do Brasil.
Publicado em **https://davimelo.com/proliferate/**.

- **Coleção** — sua "pool" de cartas. Cada arte/impressão é um item separado, com quantidade, foil, condição (NM/SP/MP/HP/DMG), idioma, notas e tags. O app calcula sozinho quantas cópias estão **em uso** nos decks e quantas estão **livres**.
- **Decks** — formatos Commander, Brawl, Standard, Modern, Pioneer, Pauper, Legacy, Vintage e Casual; comandante/parceiro, contagem vs. meta, agrupamento por tipo ou categoria, filtros de cor (Exato `=` / Identidade `≤`), gráficos (curva de mana, cores, tipos, custo médio, valor), fichas do deck, tags coloridas, capa ajustável e **pôster** em JPEG/PNG/PDF.
- **Utilitários** — fichas, planos, emblemas, marcadores, masmorras, esquemas, conspirações e atrações (Scryfall), com atalhos rápidos (Tesouro, Comida, Pista, Zumbi…).
- **Proxies (Proxy Studio)** — folhas A4 com 9 cartas em tamanho real (63 × 88 mm), dupla face expandida em frente + verso, linhas de corte, marcas de enquadramento, réguas, cruzes, presets (Guilhotina, Estilete Manual, Minimalista, Econômico), impressão pelo navegador e **PDF direto** (jsPDF) com o mesmo layout.
- **Seletor de artes** — artes oficiais (Scryfall), artes da comunidade (**MPCFill**) e imagem própria (upload ou link do Google Drive).
- **Importar/Exportar/Backup** — MTG Arena, Moxfield, LigaMagic, CSV, JSON, lista simples (nomes em português são traduzidos), pedido XML do MPCFill e backup completo com restauração substituindo ou mesclando.
- **Sincronização opcional** — Firebase (Auth por e-mail/senha + Firestore). Sem login, tudo fica salvo no navegador (localStorage).

## Como rodar

Requer Node.js 24+.

```bash
npm install
npm run dev     # http://localhost:5173/proliferate/
npm test        # testes de lógica pura (node:test)
npm run build   # tsc + vite build → dist/
```

Em desenvolvimento, o MPCFill é acessado pelo proxy do Vite (`/api-mpcfill`). Em produção, pelo Cloudflare Worker definido em `VITE_MPCFILL_PROXY` (padrão: `https://mpcfill-proxy.anancinho.workers.dev`).

## Estrutura

```
src/
  types/        modelos (models.ts), formatos (formats.ts) e regras de cartas (cardRules.ts)
  services/     scryfall, storage + normalize (migração), usage (em uso/disponível),
                importParser + importer, exporters, backup, mpcfill, proxyLayout + proxyPdf,
                poster, firebase + firebaseConfig, cloudCodec, sync, image, sorting
  state/        store (estado global + persistência), ui (modais, toasts, preview), syncStatus, nav
  components/   layout, common, collection, decks, utilities, proxies, art, io, auth
  styles/       tokens.css (design tokens), base.css, app.css, mobile.css, print.css
tests/          testes node:test das funções puras
worker/         Cloudflare Worker (proxy CORS do MPCFill)
```

Abas, modais, gráficos (Chart.js), jsPDF e Firebase são carregados sob demanda.

## Firebase (opcional)

1. Crie um projeto em <https://console.firebase.google.com>.
2. **Authentication → Método de login →** ative **E-mail/senha**.
3. **Firestore Database →** crie o banco (modo produção) e publique as regras de [`firestore.rules`](firestore.rules)
   (pelo console, ou `npx firebase-tools deploy --only firestore:rules`).
4. Em **Configurações do projeto → Seus apps → Web**, copie o `firebaseConfig`.
5. Configure de uma destas formas:
   - **Na interface**: menu do usuário → *Configurar Firebase* → cole o objeto (fica salvo só neste navegador);
   - **No build**: copie `.env.example` para `.env.local` e preencha as variáveis `VITE_FIREBASE_*`;
   - **No GitHub Pages**: cadastre as mesmas variáveis como *Secrets* do repositório (Settings → Secrets and variables → Actions).
6. Em **Authentication → Configurações → Domínios autorizados**, adicione `davimelo.com`.

Como os dados são guardados:

> O site publicado usa o mesmo projeto Firebase do Proliferate v1 (`dms-mtg-manager`). O v1 grava em `/userData/{uid}` num formato próprio,
> por isso o V2 usa a coleção **`/userDataV2`** e apenas **lê** `/userData/{uid}` para importar os dados do v1 no primeiro login (o v1 não é alterado).
> O `firestore.rules` inclui as regras das duas versões — publicá-lo substitui as regras do projeto.

- `/userDataV2/{uid}` — documento principal com revisão, id da sessão do cliente, hash e os dados comprimidos com **gzip** (base64).
- `/userDataV2/{uid}/chunks/*` — pedaços, quando os dados passam de ~900 KB.
- `/userDataV2/{uid}/images/*` — imagens próprias (data URLs) extraídas, uma por documento.
- `/usernames/{nome}` — documento público com **apenas** o uid e o nome de usuário. O e-mail nunca é gravado no Firestore.
- `/users/{uid}` — perfil com o nome de usuário (compatível com o v1).

Para publicar as regras pela linha de comando (o projeto padrão está em `.firebaserc`):

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules
```

A sincronização usa debounce de 2 s (máx. 10 s em edição contínua), listener em tempo real, nova verificação ao focar a aba ou voltar a ficar online, novas tentativas com espera exponencial e transação que nunca sobrescreve uma revisão mais nova. Em conflito, a versão mais recente vence e a outra fica guardada como backup local.

## Publicação

O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) roda testes + build e publica no GitHub Pages a cada push na `main`
(Settings → Pages → Source: **GitHub Actions**). O `base` do Vite é `/proliferate/`.

### Proxy do MPCFill (Cloudflare Worker)

```bash
npx wrangler login
npx wrangler deploy        # usa wrangler.json → worker/index.js
```

Depois, defina a URL do worker na variável de repositório `VITE_MPCFILL_PROXY` (Settings → Secrets and variables → Actions → Variables).

## Dados de cartas

Dados e imagens das cartas vêm da API pública do [Scryfall](https://scryfall.com/docs/api) (requisições em fila com intervalo de 110 ms e cabeçalho `Accept`). Artes da comunidade vêm do [MPCFill](https://mpcfill.com). Magic: The Gathering é marca da Wizards of the Coast; este é um projeto pessoal sem fins comerciais.
