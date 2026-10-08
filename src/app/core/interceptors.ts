import { HttpErrorResponse, HttpEventType, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, tap, throwError } from 'rxjs';
import { toApiError } from './api-error';
import { ApiSelector } from './api-selector.service';
import { ATTACH_SESSION_TOKEN, REQUEST_LABEL } from './http-context';
import { InspectorStore } from './inspector.store';
import { SessionStore } from './session.store';

/** Códigos que indicam que a sessão guardada não serve mais. */
const SESSION_ENDED_CODES = new Set(['INVALID_TOKEN', 'TOKEN_EXPIRED']);

/**
 * Converte qualquer falha em `ApiError`, para os componentes tratarem um formato só.
 * É o primeiro da cadeia (o mais externo), então recebe o erro depois dos outros interceptors.
 */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const apiName = inject(ApiSelector).targetOf(req.url)?.name ?? 'externa';
  return next(req).pipe(
    catchError((error: unknown) =>
      throwError(() => (error instanceof HttpErrorResponse ? toApiError(error, apiName) : error)),
    ),
  );
};

/**
 * Anexa o token da sessão da API de destino (cada API tem a sua). Se a própria API disser que o
 * token não vale mais, encerra a sessão e manda para o login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const target = inject(ApiSelector).targetOf(req.url);
  const sessions = inject(SessionStore);
  const router = inject(Router);

  const session = target ? sessions.get(target.id) : null;
  if (!target || !session || !req.context.get(ATTACH_SESSION_TOKEN) || req.headers.has('Authorization')) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${session.token}` } })).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        SESSION_ENDED_CODES.has(error.error?.error?.code) &&
        sessions.get(target.id)?.token === session.token
      ) {
        sessions.end(target.id);
        void router.navigate(['/login'], { queryParams: { motivo: 'sessao-expirada' } });
      }
      return throwError(() => error);
    }),
  );
};

/**
 * Registra a requisição como ela sai (já com o token) e a resposta crua. É o último da cadeia,
 * o mais perto da rede.
 */
export const inspectorInterceptor: HttpInterceptorFn = (req, next) => {
  const target = inject(ApiSelector).targetOf(req.url);
  if (!target) return next(req);

  const inspector = inject(InspectorStore);
  const id = inspector.start(target.name, req.context.get(REQUEST_LABEL), {
    method: req.method,
    url: req.urlWithParams,
    headers: visibleHeaders(req),
    body: req.body,
  });
  let finished = false;

  return next(req).pipe(
    tap((event) => {
      if (event.type === HttpEventType.Response) {
        finished = true;
        inspector.finish(id, {
          status: event.status,
          statusText: event.statusText,
          requestId: event.headers.get('X-Request-Id'),
          body: event.body,
        });
      }
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        finished = true;
        inspector.finish(id, {
          status: error.status,
          statusText: error.status === 0 ? 'Sem resposta' : error.statusText,
          requestId: error.headers.get('X-Request-Id'),
          body: error.error,
        });
      }
      return throwError(() => error);
    }),
    finalize(() => {
      if (!finished) inspector.finish(id, { status: 0, statusText: 'Cancelada', requestId: null, body: null });
    }),
  );
};

/** Cabeçalhos definidos pelo app, com o token encurtado para não ficar exposto na tela. */
function visibleHeaders(req: HttpRequest<unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of req.headers.keys()) {
    const value = req.headers.get(name) ?? '';
    headers[name] = name.toLowerCase() === 'authorization' ? maskToken(value) : value;
  }
  if (req.body !== null && !req.headers.has('Content-Type') && typeof req.body === 'object') {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

function maskToken(value: string): string {
  const [scheme, token] = value.split(' ');
  if (!token || token.length <= 16) return value;
  return `${scheme} ${token.slice(0, 10)}…${token.slice(-6)}`;
}
