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
import { ApiStatusStore } from './api-status.store';
import { RateLimitStore } from './rate-limit.store';
import {
  COLD_START_TIMEOUT_MS,
  SLOW_AFTER_MS,
  TIMEOUT_MS,
  apiErrorInterceptor,
  authInterceptor,
  coldStartInterceptor,
  inspectorInterceptor,
} from './interceptors';
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
        provideHttpClient(
          withInterceptors([apiErrorInterceptor, coldStartInterceptor, authInterceptor, inspectorInterceptor]),
        ),
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

  it('lê os cabeçalhos de rate limit e o Retry-After do 429', async () => {
    const result = firstValueFrom(http.post(`${EXPRESS}/auth/login`, {})).catch((e: unknown) => e);
    backend.expectOne(`${EXPRESS}/auth/login`).flush(errorBody(429, 'TOO_MANY_REQUESTS'), {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        RateLimit: '"100-in-900sec"; r=90; t=600, "10-in-900sec"; r=0; t=600',
        'RateLimit-Policy': '"100-in-900sec"; q=100; w=900; pk=:abc:, "10-in-900sec"; q=10; w=900; pk=:abc:',
        'Retry-After': '600',
      },
    });

    const error = (await result) as ApiError;
    expect(error.code).toBe('TOO_MANY_REQUESTS');
    expect(error.retryAfter).toBe(600);

    const [entry] = inspector.entries();
    expect(entry.response?.retryAfter).toBe(600);
    expect(entry.response?.rateLimit.map((q) => [q.name, q.remaining, q.limit])).toEqual([
      ['100-in-900sec', 90, 100],
      ['10-in-900sec', 0, 10],
    ]);
    // O quadro do painel guarda o último valor de cada API.
    expect(
      TestBed.inject(RateLimitStore)
        .all()
        .express?.map((q) => q.remaining),
    ).toEqual([90, 0]);
    expect(TestBed.inject(RateLimitStore).all().flask).toBeUndefined();
  });

  it('não mexe em requisições para outros endereços', () => {
    sessions.start('express', authResult(TOKEN));

    http.get('https://exemplo.com/dados').subscribe();

    expect(backend.expectOne('https://exemplo.com/dados').request.headers.has('Authorization')).toBe(false);
    expect(inspector.entries()).toEqual([]);
  });

  describe('cold start', () => {
    let status: ApiStatusStore;

    beforeEach(() => {
      vi.useFakeTimers();
      status = TestBed.inject(ApiStatusStore);
    });

    afterEach(() => vi.useRealTimers());

    it('avisa que a API está acordando quando a resposta demora', () => {
      http.get(`${FLASK}/health`).subscribe();
      expect(status.waking()).toEqual([]);

      vi.advanceTimersByTime(SLOW_AFTER_MS);
      expect(status.waking().map((target) => target.id)).toEqual(['flask']);

      backend.expectOne(`${FLASK}/health`).flush({ data: { status: 'ok' } });
      expect(status.waking()).toEqual([]);
      expect(status.isAwake('flask')).toBe(true);
    });

    it('espera mais pela API que pode estar dormindo e desiste com TIMEOUT', async () => {
      const result = firstValueFrom(http.get(`${EXPRESS}/health`)).catch((e: unknown) => e);
      const req = backend.expectOne(`${EXPRESS}/health`);

      vi.advanceTimersByTime(TIMEOUT_MS);
      expect(req.cancelled).toBe(false);

      vi.advanceTimersByTime(COLD_START_TIMEOUT_MS - TIMEOUT_MS);
      const error = await result;
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe('TIMEOUT');
      expect(req.cancelled).toBe(true);
      expect(status.waking()).toEqual([]);
    });

    it('com a API acordada, usa o limite normal e não mostra aviso', async () => {
      status.markResponse('express');
      const result = firstValueFrom(http.get(`${EXPRESS}/tasks`)).catch((e: unknown) => e);
      backend.expectOne(`${EXPRESS}/tasks`);

      vi.advanceTimersByTime(SLOW_AFTER_MS);
      expect(status.waking()).toEqual([]);

      vi.advanceTimersByTime(TIMEOUT_MS);
      expect(((await result) as ApiError).code).toBe('TIMEOUT');
    });

    it('resposta de erro também conta como API acordada', async () => {
      const result = firstValueFrom(http.get(`${EXPRESS}/tasks`)).catch(() => undefined);
      backend.expectOne(`${EXPRESS}/tasks`).flush(errorBody(401, 'MISSING_TOKEN'), { status: 401, statusText: '' });
      await result;

      expect(status.isAwake('express')).toBe(true);
    });
  });
});
