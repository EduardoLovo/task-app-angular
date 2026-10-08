# Task App — Angular

Front em **Angular 22** que consome as duas versões da Task API — [Express](https://github.com/EduardoLovo/Task-api-express)
e [Flask](https://github.com/EduardoLovo/task-api-flask) — pela mesma interface. O foco é mostrar que as duas APIs
têm **o mesmo contrato** e como elas tratam erros.

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

Os endereços das APIs ficam em [src/environments](src/environments): `environment.development.ts` no `ng serve`
e `environment.ts` no build de produção. No deploy, configure o `CORS_ORIGIN` das APIs com o domínio do front.

## Como funciona

### Interceptors

A ordem em [app.config.ts](src/app/app.config.ts) importa: o primeiro é o mais externo.

1. **`apiErrorInterceptor`** — converte qualquer falha em `ApiError` (`status`, `code`, `message`, `details`,
   `requestId`). Falha de rede/CORS vira `NETWORK_ERROR`; resposta fora do contrato vira `UNEXPECTED_RESPONSE`.
   Os componentes tratam um formato só.
2. **`authInterceptor`** — anexa o token da sessão **da API de destino** (descoberta pela URL). Se a API responder
   `INVALID_TOKEN` ou `TOKEN_EXPIRED` para o token que ele mesmo anexou, encerra a sessão e leva ao login. Tokens
   enviados de propósito pelo "Testar erros" não derrubam a sessão.
3. **`inspectorInterceptor`** — o mais perto da rede: registra a requisição já com o token e a resposta antes de
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
│   ├── interceptors.ts
│   ├── auth.service.ts / tasks.service.ts
│   └── auth.guards.ts
├── features/
│   ├── auth/               # login e cadastro (mesmo componente)
│   ├── tasks/              # lista e formulário
│   └── error-lab/          # cenários de erro e a tabela comparativa
└── shared/                 # alerta de erro, painel e helpers de formulário
```
