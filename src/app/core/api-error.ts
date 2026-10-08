import { HttpErrorResponse } from '@angular/common/http';
import { ErrorBody, ErrorDetail } from './api.models';

/**
 * Erro de API já normalizado. Toda falha de requisição chega aos componentes como `ApiError`,
 * inclusive as que não vieram da API (rede fora do ar, CORS, resposta fora do contrato).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ErrorDetail[] = [],
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Mensagens de `details` agrupadas por campo, para exibir junto do input. */
  fieldErrors(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const detail of this.details) {
      (result[detail.field] ??= []).push(detail.message);
    }
    return result;
  }
}

export function isErrorBody(body: unknown): body is ErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const error = (body as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

/** Converte a falha do HttpClient no formato de erro do contrato. */
export function toApiError(response: HttpErrorResponse, apiName: string): ApiError {
  // status 0: a requisição nem chegou a ter resposta (API desligada, CORS, sem rede).
  if (response.status === 0) {
    return new ApiError(
      0,
      'NETWORK_ERROR',
      `Não foi possível conectar à API ${apiName}. Confira se ela está rodando e se o CORS libera este endereço.`,
    );
  }

  const body: unknown = response.error;
  if (isErrorBody(body)) {
    const { status, code, message, details, requestId } = body.error;
    return new ApiError(status, code, message, Array.isArray(details) ? details : [], requestId ?? null);
  }

  return new ApiError(
    response.status,
    'UNEXPECTED_RESPONSE',
    `A API ${apiName} respondeu ${response.status} fora do formato de erro combinado.`,
    [],
    response.headers.get('X-Request-Id'),
  );
}
