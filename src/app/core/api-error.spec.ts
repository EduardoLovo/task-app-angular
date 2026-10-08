import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ApiError, toApiError } from './api-error';

describe('toApiError', () => {
  it('usa o corpo de erro do contrato', () => {
    const response = new HttpErrorResponse({
      status: 400,
      error: {
        error: {
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Dados da requisição inválidos',
          details: [
            { location: 'body', field: 'title', message: 'Título é obrigatório' },
            { location: 'body', field: 'title', message: 'Outro problema' },
          ],
          requestId: 'abc-123',
        },
      },
    });

    const error = toApiError(response, 'Express');

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Dados da requisição inválidos');
    expect(error.requestId).toBe('abc-123');
    expect(error.fieldErrors()).toEqual({ title: ['Título é obrigatório', 'Outro problema'] });
  });

  it('trata falha de rede (status 0) como NETWORK_ERROR', () => {
    const error = toApiError(new HttpErrorResponse({ status: 0 }), 'Flask');

    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toContain('Flask');
  });

  it('marca resposta fora do contrato como UNEXPECTED_RESPONSE', () => {
    const response = new HttpErrorResponse({
      status: 502,
      error: '<html>Bad Gateway</html>',
      headers: new HttpHeaders({ 'X-Request-Id': 'req-9' }),
    });

    const error = toApiError(response, 'Express');

    expect(error.status).toBe(502);
    expect(error.code).toBe('UNEXPECTED_RESPONSE');
    expect(error.requestId).toBe('req-9');
    expect(error.details).toEqual([]);
  });
});
