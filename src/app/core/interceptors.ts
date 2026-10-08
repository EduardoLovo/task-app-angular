import { HttpErrorResponse, HttpEventType, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, defer, finalize, tap, throwError, timeout } from 'rxjs';
import { ApiError, toApiError } from './api-error';
import { ApiSelector } from './api-selector.service';
import { ApiStatusStore } from './api-status.store';
import { ATTACH_SESSION_TOKEN, REQUEST_LABEL } from './http-context';
import { InspectorStore } from './inspector.store';
import { SessionStore } from './session.store';

/** Depois disso sem resposta, a API provavelmente está acordando: o app mostra um aviso. */
export const SLOW_AFTER_MS = 3_000;
/** Limite de espera com a API acordada... */
export const TIMEOUT_MS = 20_000;
/** ...e quando ela pode estar dormindo (cold start de 15 a 60 s no plano free do Render). */
export const COLD_START_TIMEOUT_MS = 90_000;

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
 * Lida com a soneca das APIs: avisa quando a resposta demora e dá mais tempo à primeira requisição depois de um
 * período sem uso. Sem isso, o app pareceria travado durante o cold start.
 */
export const coldStartInterceptor: HttpInterceptorFn = (req, next) => {
  const target = inject(ApiSelector).targetOf(req.url);
  if (!target) return next(req);
  const status = inject(ApiStatusStore);

  return defer(() => {
    const awake = status.isAwake(target.id);
    const limit = awake ? TIMEOUT_MS : COLD_START_TIMEOUT_MS;
    let slow = false;
    const slowTimer = awake
      ? undefined
      : setTimeout(() => {
          slow = true;
          status.slowStarted(target.id);
        }, SLOW_AFTER_MS);

    return next(req).pipe(
      tap({
        next: (event) => {
          if (event.type === HttpEventType.Response) status.markResponse(target.id);
        },
        // Qualquer resposta HTTP, mesmo de erro, mostra que a API está de pé; status 0 é falta de resposta.
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status !== 0) status.markResponse(target.id);
        },
      }),
      // `each`: o HttpClient emite um evento logo no envio, e o relógio recomeça a partir dele.
      timeout({
        each: limit,
        with: () =>
          throwError(
            () => new ApiError(0, 'TIMEOUT', `A API ${target.name} não respondeu em ${limit / 1000} s. Tente de novo.`),
          ),
      }),
      finalize(() => {
        clearTimeout(slowTimer);
        if (slow) status.slowFinished(target.id);
      }),
    );
  });
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
      if (!finished)
        inspector.finish(id, {
          status: 0,
          statusText: 'Cancelada ou sem resposta a tempo',
          requestId: null,
          body: null,
        });
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
