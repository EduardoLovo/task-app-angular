# Task App — Angular

[![CI](https://github.com/EduardoLovo/task-app--angular/actions/workflows/ci.yml/badge.svg)](https://github.com/EduardoLovo/task-app--angular/actions/workflows/ci.yml)

Front em **Angular 22** que consome as duas versões da Task API — [Express](https://github.com/EduardoLovo/Task-api-express)
e [Flask](https://github.com/EduardoLovo/task-api-flask) — pela mesma interface. O foco é mostrar que as duas APIs
têm **o mesmo contrato** e como elas tratam erros.

**Demonstração:** https://task-app-angular-taupe.vercel.app (as APIs ficam no plano gratuito do Render: a primeira
requisição depois de um tempo parado pode levar até 1 min, e os dados são apagados quando elas reiniciam).

## O que tem

- **Seletor de API** no topo (Express | Flask). Cada API tem o seu banco e recusa tokens da outra (claim `iss`),
  então o front guarda **uma sessão por API**: trocar no seletor pede um login separado.
- **Cadastro e login**, **lista de tarefas** com busca, filtros, ordenação e paginação, e **formulário** de
  criar/editar.
- **Painel "por baixo dos panos"**: cada requisição como saiu (método, URL, cabeçalhos, corpo — com o token
  encurtado) e a resposta crua da API (status, corpo, `X-Request-Id`, duração).
- **Testar erros**: 14 requisições inválidas de propósito (JSON malformado, Content-Type errado, token adulterado,
  token da outra API, campos inválidos, rota/método inexistente...). Cada uma roda **nas duas APIs lado a lado** e é
  comparada com o `status` e o `code` esperados pelo contrato.
- **Validação nos dois lados**: os formulários usam as mesmas regras do backend. Um checkbox desliga a validação do
  front para ver a API recusando, e os itens de `details` do erro aparecem embaixo do campo certo.

## Stack

| Item       | Escolha                                                           |
| ---------- | ----------------------------------------------------------------- |
| Framework  | Angular 22 (componentes standalone, signals, sem Zone.js)         |
| HTTP       | `HttpClient` com interceptors funcionais (token, erros, inspetor) |
| Formulário | Reactive Forms                                                    |
| Testes     | Vitest (`ng test`) + `HttpTestingController`                      |
| Qualidade  | angular-eslint, Prettier, CI no GitHub Actions, Dependabot        |

## Como rodar

Suba as duas APIs (o jeito mais simples é o repositório `task-api-compose`):

```bash
cd ../task-api-compose
docker compose up --build -d
```

Depois, o front:

```bash
npm install
npm start              # http://localhost:4200
```

```bash
npm test               # testes unitários (npm run test:watch para modo observação)
npm run lint           # ESLint em TypeScript e templates
npm run format         # Prettier (format:check só verifica)
npm run build          # build de produção em dist/
```

Os endereços das APIs ficam em [src/environments](src/environments):

| Arquivo                      | Usado em                   | APIs                                                    |
| ---------------------------- | -------------------------- | ------------------------------------------------------- |
| `environment.development.ts` | `npm start` (`ng serve`)   | `localhost:3000` e `localhost:5000`                     |
| `environment.ts`             | `npm run build` (produção) | Render: `task-api-express-2pva` e `task-api-flask-1ozq` |

Para testar o build de produção localmente contra o Render: `npx ng serve --configuration production`.

## APIs no plano free do Render

- **Soneca e cold start**: a API dorme depois de 15 min sem acesso, e a primeira requisição leva de 15 a 60 s. O
  `coldStartInterceptor` mostra o aviso "Acordando a API..." quando a resposta passa de 3 s e espera até 90 s (em
  vez de 20 s) enquanto a API não respondeu nos últimos 14 min. Ao escolher uma API, o app já chama `/health` para
  acordá-la enquanto o usuário preenche o login. Não há "ping" periódico: as 750 h grátis são divididas entre as
  duas APIs.
- **Banco temporário**: o SQLite volta vazio a cada deploy, reinício ou soneca. Um token de usuário que sumiu recebe
  `401 INVALID_TOKEN`, e o front encerra a sessão e leva ao login, sugerindo criar a conta de novo. Com
  `demo: true` no environment, a interface avisa que é uma demonstração.
- **CORS**: depois de publicar o front, troque o `CORS_ORIGIN` das APIs de `*` para o domínio dele (no `render.yaml`
  do `task-api-compose`). Atenção: os previews da Vercel têm uma URL por branch e seriam recusados por um
  `CORS_ORIGIN` com um domínio só.

## Deploy (Vercel)

O [vercel.json](vercel.json) fixa a configuração do build, sem depender da detecção automática:

- `npm ci` + `npm run build`, publicando `dist/task-app-angular/browser`;
- **rewrite para o `index.html`**: as rotas (`/tarefas`, `/erros`...) existem só no Angular, e sem isso recarregar a
  página numa delas daria 404. Arquivos que existem de verdade (JS, CSS, favicon) são servidos antes do rewrite;
- **cache longo para JS e CSS**: o build gera nomes com hash (`outputHashing: all`), então cada versão nova tem
  arquivos novos e o cache nunca fica velho. O `index.html` segue sem cache longo.

Para publicar, importe o repositório no painel da Vercel. Cada push na `main` gera um deploy de produção, e cada PR,
uma URL de preview.

## Como funciona

### Interceptors

A ordem em [app.config.ts](src/app/app.config.ts) importa: o primeiro é o mais externo.

1. **`apiErrorInterceptor`** — converte qualquer falha em `ApiError` (`status`, `code`, `message`, `details`,
   `requestId`). Falha de rede/CORS vira `NETWORK_ERROR`; resposta fora do contrato vira `UNEXPECTED_RESPONSE`.
   Os componentes tratam um formato só.
2. **`coldStartInterceptor`** — avisa quando a API está demorando (acordando) e aplica o limite de espera: 20 s
   com a API acordada, 90 s quando ela pode estar dormindo. Estourou, vira `ApiError` com `code` `TIMEOUT`.
3. **`authInterceptor`** — anexa o token da sessão **da API de destino** (descoberta pela URL). Se a API responder
   `INVALID_TOKEN` ou `TOKEN_EXPIRED` para o token que ele mesmo anexou, encerra a sessão e leva ao login. Tokens
   enviados de propósito pelo "Testar erros" não derrubam a sessão.
4. **`inspectorInterceptor`** — o mais perto da rede: registra a requisição já com o token e a resposta antes de
   virar `ApiError`, para o painel mostrar o que de fato trafegou.

### Estrutura

```
src/app/
├── core/                   # contrato, estado e HTTP
│   ├── api.models.ts       # tipos do contrato (Task, erros, paginação)
│   ├── api-error.ts        # ApiError e a normalização de erros
│   ├── api-selector.service.ts  # API escolhida e montagem das URLs
│   ├── session.store.ts    # uma sessão por API (localStorage)
│   ├── inspector.store.ts  # histórico do painel "por baixo dos panos"
│   ├── api-status.store.ts # quais APIs estão acordadas (cold start do Render)
│   ├── interceptors.ts
│   ├── auth.service.ts / tasks.service.ts
│   └── auth.guards.ts
├── features/
│   ├── auth/               # login e cadastro (mesmo componente)
│   ├── tasks/              # lista e formulário
│   └── error-lab/          # cenários de erro e a tabela comparativa
└── shared/                 # alerta de erro, painel e helpers de formulário
```
