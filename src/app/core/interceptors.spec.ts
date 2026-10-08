import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiError } from './api-error';
import { API_TARGETS } from './api-selector.service';
import { AuthResult } from './api.models';
import { ATTACH_SESSION_TOKEN, labeled } from './http-context';
import { InspectorStore } from './inspector.store';
import { apiErrorInterceptor, authInterceptor, inspectorInterceptor } from './interceptors';
import { SessionStore } from './session.store';

const EXPRESS = API_TARGETS.express.baseUrl;
const FLASK = API_TARGETS.flask.baseUrl;
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.assinatura-do-token';

function authResult(token: string): AuthResult {
  return {
    user: { id: 1, name: 'Ana', email: 'ana@exemplo.com', createdAt: '2026-10-08T00:00:00.000Z' },
    accessToken: token,
    tokenType: 'Bearer',
    expiresIn: '1h',
  };
}

function errorBody(status: number, code: string) {
  return { error: { status, code, message: 'Mensagem', details: [], requestId: 'req-1' } };
}

describe('interceptors', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let sessions: SessionStore;
  let inspector: InspectorStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor, authInterceptor, inspectorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    sessions = TestBed.inject(SessionStore);
    inspector = TestBed.inject(InspectorStore);
  });

  afterEach(() => backend.verify());

  it('anexa o token da sessão da API de destino', () => {
    sessions.start('express', authResult(TOKEN));

    http.get(`${EXPRESS}/tasks`).subscribe();
    http.get(`${FLASK}/tasks`).subscribe();

    expect(backend.expectOne(`${EXPRESS}/tasks`).request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    // Sem sessão no Flask: o token do Express não vai para lá.
    expect(backend.expectOne(`${FLASK}/tasks`).request.headers.has('Authorization')).toBe(false);
  });

  it('não anexa o token quando o contexto pede', () => {
    sessions.start('express', authResult(TOKEN));

    http.get(`${EXPRESS}/tasks`, { context: new HttpContext().set(ATTACH_SESSION_TOKEN, false) }).subscribe();

    expect(backend.expectOne(`${EXPRESS}/tasks`).request.headers.has('Authorization')).toBe(false);
  });

  it('entrega os erros como ApiError', async () => {
    const result = firstValueFrom(http.get(`${EXPRESS}/tasks/999`));
    backend.expectOne(`${EXPRESS}/tasks/999`).flush(errorBody(404, 'TASK_NOT_FOUND'), { status: 404, statusText: '' });

    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('TASK_NOT_FOUND');
  });

  it('encerra a sessão quando a API recusa o token dela', async () => {
    sessions.start('express', authResult(TOKEN));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const result = firstValueFrom(http.get(`${EXPRESS}/tasks`));
    backend.expectOne(`${EXPRESS}/tasks`).flush(errorBody(401, 'TOKEN_EXPIRED'), { status: 401, statusText: '' });
    await result.catch(() => undefined);

    expect(sessions.get('express')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { motivo: 'sessao-expirada' } });
  });

  it('mantém a sessão quando o token recusado foi enviado de propósito', async () => {
    sessions.start('express', authResult(TOKEN));

    const result = firstValueFrom(
      http.get(`${EXPRESS}/tasks`, { headers: { Authorization: 'Bearer token-adulterado' } }),
    );
    backend.expectOne(`${EXPRESS}/tasks`).flush(errorBody(401, 'INVALID_TOKEN'), { status: 401, statusText: '' });
    await result.catch(() => undefined);

    expect(sessions.get('express')).not.toBeNull();
  });

  it('registra a requisição e a resposta crua no inspetor, com o token encurtado', () => {
    sessions.start('flask', authResult(TOKEN));

    http
      .post(`${FLASK}/tasks`, { title: '' }, { context: labeled('Criar tarefa') })
      .subscribe({ error: () => undefined });
    backend.expectOne(`${FLASK}/tasks`).flush(errorBody(400, 'VALIDATION_ERROR'), { status: 400, statusText: 'Bad' });

    const [entry] = inspector.entries();
    expect(entry.api).toBe('Flask');
    expect(entry.label).toBe('Criar tarefa');
    expect(entry.request.body).toEqual({ title: '' });
    expect(entry.request.headers['Authorization']).not.toContain(TOKEN);
    expect(entry.request.headers['Authorization']).toMatch(/^Bearer eyJhbGciOi…/);
    expect(entry.response?.status).toBe(400);
    expect(entry.response?.body).toEqual(errorBody(400, 'VALIDATION_ERROR'));
    expect(inspector.errorCount()).toBe(1);
  });

  it('não mexe em requisições para outros endereços', () => {
    sessions.start('express', authResult(TOKEN));

    http.get('https://exemplo.com/dados').subscribe();

    expect(backend.expectOne('https://exemplo.com/dados').request.headers.has('Authorization')).toBe(false);
    expect(inspector.entries()).toEqual([]);
  });
});
