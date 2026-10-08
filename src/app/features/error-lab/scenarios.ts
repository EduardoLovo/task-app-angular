import { HttpHeaders } from '@angular/common/http';
import { ApiId } from '../../core/api-selector.service';

/** Uma requisição inválida de propósito e o erro que as duas APIs devem devolver. */
export interface Scenario {
  id: string;
  title: string;
  description: string;
  expectedStatus: number;
  expectedCode: string;
  /** Precisa de login na API: sem ele, a resposta seria MISSING_TOKEN. */
  needsSession?: boolean;
  /** Precisa de login na *outra* API. */
  needsOtherSession?: boolean;
  request: (ctx: ScenarioContext) => ScenarioRequest;
}

export interface ScenarioContext {
  /** Token da sessão na outra API, se houver. */
  otherToken: string | null;
}

export interface ScenarioRequest {
  method: string;
  path: string;
  body?: unknown;
  headers?: HttpHeaders;
  /** `false`: não anexa o token da sessão. */
  attachToken?: boolean;
}

const JSON_HEADERS = new HttpHeaders({ 'Content-Type': 'application/json' });

export const OTHER_API: Record<ApiId, ApiId> = { express: 'flask', flask: 'express' };

export const SCENARIOS: Scenario[] = [
  {
    id: 'register-invalid',
    title: 'Cadastro com dados inválidos',
    description: 'Nome curto, e-mail sem formato e senha curta: todos os problemas voltam juntos em details.',
    expectedStatus: 400,
    expectedCode: 'VALIDATION_ERROR',
    request: () => ({
      method: 'POST',
      path: '/auth/register',
      body: { name: 'A', email: 'isto-nao-e-email', password: '123' },
      attachToken: false,
    }),
  },
  {
    id: 'invalid-json',
    title: 'JSON malformado',
    description: 'Corpo cortado no meio, com Content-Type application/json.',
    expectedStatus: 400,
    expectedCode: 'INVALID_JSON',
    request: () => ({
      method: 'POST',
      path: '/auth/login',
      body: '{"email": "ana@exemplo.com", ',
      headers: JSON_HEADERS,
      attachToken: false,
    }),
  },
  {
    id: 'wrong-content-type',
    title: 'Content-Type errado',
    description: 'Corpo em texto puro: as APIs só aceitam application/json.',
    expectedStatus: 415,
    expectedCode: 'UNSUPPORTED_MEDIA_TYPE',
    request: () => ({
      method: 'POST',
      path: '/auth/login',
      body: 'email=ana@exemplo.com&password=12345678',
      headers: new HttpHeaders({ 'Content-Type': 'text/plain' }),
      attachToken: false,
    }),
  },
  {
    id: 'wrong-credentials',
    title: 'Senha errada',
    description: 'A resposta é a mesma para e-mail inexistente e senha errada, para não revelar quem tem conta.',
    expectedStatus: 401,
    expectedCode: 'INVALID_CREDENTIALS',
    request: () => ({
      method: 'POST',
      path: '/auth/login',
      body: { email: 'ninguem@exemplo.com', password: 'senha-errada-123' },
      attachToken: false,
    }),
  },
  {
    id: 'missing-token',
    title: 'Sem token',
    description: 'Rota protegida sem o cabeçalho Authorization.',
    expectedStatus: 401,
    expectedCode: 'MISSING_TOKEN',
    request: () => ({ method: 'GET', path: '/tasks', attachToken: false }),
  },
  {
    id: 'bad-auth-header',
    title: 'Cabeçalho fora do formato',
    description: 'Authorization sem o esquema Bearer.',
    expectedStatus: 401,
    expectedCode: 'INVALID_AUTH_HEADER',
    request: () => ({
      method: 'GET',
      path: '/tasks',
      headers: new HttpHeaders({ Authorization: 'Token abc123' }),
    }),
  },
  {
    id: 'tampered-token',
    title: 'Token adulterado',
    description: 'Um JWT com assinatura que não confere.',
    expectedStatus: 401,
    expectedCode: 'INVALID_TOKEN',
    request: () => ({
      method: 'GET',
      path: '/tasks',
      headers: new HttpHeaders({
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.assinatura-falsa',
      }),
    }),
  },
  {
    id: 'other-api-token',
    title: 'Token da outra API',
    description: 'Token válido, mas emitido pela outra API (claim iss diferente). Exige login nas duas.',
    expectedStatus: 401,
    expectedCode: 'INVALID_TOKEN',
    needsOtherSession: true,
    request: ({ otherToken }) => ({
      method: 'GET',
      path: '/tasks',
      headers: new HttpHeaders({ Authorization: `Bearer ${otherToken}` }),
    }),
  },
  {
    id: 'invalid-task',
    title: 'Tarefa inválida',
    description: 'Título vazio, status e prioridade fora da lista, data que não existe e um campo extra.',
    expectedStatus: 400,
    expectedCode: 'VALIDATION_ERROR',
    needsSession: true,
    request: () => ({
      method: 'POST',
      path: '/tasks',
      body: { title: '', status: 'feito', priority: 'urgente', dueDate: '2026-02-30', cor: 'azul' },
    }),
  },
  {
    id: 'invalid-query',
    title: 'Filtros inválidos',
    description: 'limit acima de 100, sortBy e status desconhecidos na query string.',
    expectedStatus: 400,
    expectedCode: 'VALIDATION_ERROR',
    needsSession: true,
    request: () => ({ method: 'GET', path: '/tasks?limit=1000&sortBy=cor&status=feito' }),
  },
  {
    id: 'invalid-id',
    title: 'ID que não é número',
    description: 'O parâmetro da rota também é validado.',
    expectedStatus: 400,
    expectedCode: 'VALIDATION_ERROR',
    needsSession: true,
    request: () => ({ method: 'GET', path: '/tasks/abc' }),
  },
  {
    id: 'task-not-found',
    title: 'Tarefa inexistente',
    description: 'ID válido, mas sem tarefa no banco.',
    expectedStatus: 404,
    expectedCode: 'TASK_NOT_FOUND',
    needsSession: true,
    request: () => ({ method: 'GET', path: '/tasks/999999999' }),
  },
  {
    id: 'route-not-found',
    title: 'Rota inexistente',
    description: 'Até o 404 de rota segue o formato de erro.',
    expectedStatus: 404,
    expectedCode: 'ROUTE_NOT_FOUND',
    request: () => ({ method: 'GET', path: '/rota-que-nao-existe', attachToken: false }),
  },
  {
    id: 'method-not-allowed',
    title: 'Método não permitido',
    description: 'PUT em /tasks: a resposta traz o cabeçalho Allow com os métodos válidos.',
    expectedStatus: 405,
    expectedCode: 'METHOD_NOT_ALLOWED',
    request: () => ({ method: 'PUT', path: '/tasks', body: {} }),
  },
];
