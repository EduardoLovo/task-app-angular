# task-app-angular

Frontend em **Angular** que consome as duas versões da Task API. É uma vitrine de portfólio: o foco é mostrar que
as duas APIs têm o **mesmo contrato** e o tratamento de erros delas.

## Projetos relacionados (pastas lado a lado em `D:\Dev`)

| Repositório                                                 | O que é                                            | Porta local |
| ----------------------------------------------------------- | -------------------------------------------------- | ----------- |
| `task-api-express` (GitHub: `EduardoLovo/Task-api-express`) | API em Node.js + Express 5                         | 3000        |
| `task-api-flask` (GitHub: `EduardoLovo/task-api-flask`)     | Mesma API em Python + Flask 3                      | 5000        |
| `task-api-compose` (GitHub: `EduardoLovo/task-api-compose`) | Sobe as duas com Docker e roda o teste de contrato | —           |

Cada repositório tem um `README.md` (endpoints, regras, códigos de erro) e um `ESTUDO.md` (como foi construído).
A especificação OpenAPI fica em `/openapi.json` de cada API, e a documentação interativa em `/docs`.

## APIs em produção (Render, plano free)

| API     | URL                                        |
| ------- | ------------------------------------------ |
| Express | https://task-api-express-2pva.onrender.com |
| Flask   | https://task-api-flask-1ozq.onrender.com   |

- O deploy é feito pelo Blueprint (`render.yaml`) no repositório `task-api-compose`. Cada push na `main` de uma API
  faz o deploy dela depois que o CI passa.
- **Soneca:** depois de 15 min sem acesso, a API dorme. A primeira requisição leva de 15 a 60 s para responder (cold
  start). O front precisa mostrar um aviso ("acordando a API...") em vez de parecer travado. **Não** usar serviços
  que "pingam" a API para mantê-la acordada: as 750 h grátis por mês são somadas entre os dois serviços.
- **Banco temporário:** o SQLite começa vazio a cada deploy, reinício ou soneca. Usuários e tarefas somem; o front
  deve lidar com um token que deixou de valer (`401 INVALID_TOKEN`) mandando o usuário fazer login de novo, e pode
  avisar que é uma demonstração.
- Rate limit por IP real do cliente (`TRUST_PROXY=3`, medido): 100 requisições a cada 15 min, e 10 tentativas de
  cadastro/login. O cabeçalho `RateLimit` traz quantas restam, e `Retry-After` vem no 429.

## Front em produção (Vercel)

- URL: https://task-app-angular-taupe.vercel.app — repositório `EduardoLovo/task-app--angular` (com dois hífens).
- Configuração em `vercel.json`: build, pasta `dist/task-app-angular/browser`, rewrite para o `index.html` só em
  caminhos sem extensão (arquivo inexistente dá 404, não HTML) e cache `immutable` para JS/CSS (nomes com hash).
  Cada push na `main` faz deploy de produção; cada PR ganha uma URL de preview.
- `environment.ts` (build de produção) aponta para o Render, com `demo: true` (avisos de demonstração);
  `environment.development.ts` continua em `localhost`.
- Cold start tratado pelo `coldStartInterceptor` + `ApiStatusStore` (aviso após 3 s, espera de até 90 s se a API
  não respondeu nos últimos 14 min, 20 s se respondeu; `/health` ao escolher a API para acordá-la).

## Pendências

- Feito (2026-10-08): `CORS_ORIGIN` das APIs no Render restrito a
  `https://task-app-angular-taupe.vercel.app,https://task-app-angular-*-eduardolovos-projects.vercel.app`
  (produção + previews da conta `eduardolovos-projects`; o `*` não casa ponto). As APIs aceitam lista de origens
  desde os PRs `feat/cors-lista-de-origens`. Consequência: `localhost` não acessa as APIs do Render; para testar o
  build de produção localmente, rodar as APIs locais. Os previews da Vercel têm Deployment Protection (só abrem
  logado na Vercel).
- Feito (2026-10-08): `RateLimit`, `RateLimit-Policy` e `Retry-After` expostos no CORS das duas APIs, com formato
  idêntico (nome da política em segundos, `"100-in-900sec"`; nas rotas `/auth`, as duas políticas; mesmo `pk`).
  Testado em produção a partir do front na Vercel.
- Feito (2026-10-09): o painel "por baixo dos panos" mostra o limite de requisições das duas APIs lado a lado
  (`rate-limit.ts` + `RateLimitStore`, alimentados pelo `inspectorInterceptor`), e o alerta de 429 mostra o
  `Retry-After`.
- Diferença conhecida entre as APIs: com IPv6, o Express limita por faixa /56 e o Flask por endereço.

## Contrato das APIs (resumo)

- Endpoints: `GET /health` · `POST /auth/register` · `POST /auth/login` · `GET /auth/me` · `GET|POST /tasks` ·
  `GET|PATCH|DELETE /tasks/:id`. Rotas autenticadas usam `Authorization: Bearer <token>`.
- Sucesso: `{ "data": ... }`. A listagem devolve `{ "data": [...], "meta": { page, limit, total, totalPages } }`.
- **Todo erro** tem o formato:
  `{ "error": { "status", "code", "message", "details": [{ location, field, message }], "requestId" } }`.
  O `code` é estável (`VALIDATION_ERROR`, `INVALID_TOKEN`, `TASK_NOT_FOUND`...), e a `message` vem em português.
- Tarefa: `id, title (1–120), description (até 1000, aceita null), status (pending|in_progress|done),
priority (low|medium|high), dueDate (YYYY-MM-DD ou null), createdAt, updatedAt`. Campos extras são recusados.
- Query de `GET /tasks`: `status, priority, search, page, limit (1–100), sortBy (createdAt|dueDate|priority|title),
order (asc|desc)`.
- **Tokens não valem de uma API para a outra**: cada uma tem o seu banco e confere o emissor (`iss`). Ao trocar de
  API no seletor, o front precisa de uma sessão (login) separada para cada uma.
- CORS: as APIs leem `CORS_ORIGIN` (padrão `*`); no deploy, configurar o domínio do front.

## O que foi combinado para o front

- **Um front único com seletor de API** (Express | Flask) no topo, e não uma página para cada API.
- Telas pequenas de propósito: cadastro/login, lista de tarefas com filtros e paginação, formulário de tarefa.
- **Painel "por baixo dos panos"**: mostra a requisição enviada e a resposta crua (status, `code`, `details`,
  `requestId`). É o que destaca o tratamento de erros, foco do projeto.
- Um botão para "testar erros", que envia requisições inválidas de propósito.
- Angular escolhido por ser uma stack nova no portfólio (que já tem React/Next.js) e por encaixar bem: interceptor do
  `HttpClient` (token e erros num lugar só), Reactive Forms (mesmas regras do backend), serviço injetado com a API
  escolhida.

## Como o usuário trabalha

- Português do Brasil em tudo (conversa, mensagens da interface, comentários).
- **O usuário faz os próprios commits**: só sugerir a mensagem (e o nome da branch), nunca commitar.
- Os repositórios das APIs têm a `main` protegida: mudanças entram por branch + PR com CI verde.
- Padrão de qualidade das APIs, para manter no front: CI no GitHub Actions (lint, testes, build), Dependabot,
  lint/formatação automáticos, `.gitattributes` com `eol=lf`, README e `ESTUDO.md` (gerado com `/estudo` no fim).
- Ambiente: Windows 11, Node 24, Docker Desktop.
- Nesta máquina, a imagem `python:3.14-slim` está corrompida no Docker local. Por isso os `.env` do Flask e do
  compose usam `PYTHON_IMAGE=python:3.14-slim-bookworm`.
