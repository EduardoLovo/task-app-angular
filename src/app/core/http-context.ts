import { HttpContext, HttpContextToken } from '@angular/common/http';

/** `false` impede o interceptor de anexar o token da sessão (usado no laboratório de erros). */
export const ATTACH_SESSION_TOKEN = new HttpContextToken<boolean>(() => true);

/** Nome amigável da requisição no painel "por baixo dos panos". */
export const REQUEST_LABEL = new HttpContextToken<string | null>(() => null);

export function labeled(label: string, context = new HttpContext()): HttpContext {
  return context.set(REQUEST_LABEL, label);
}
