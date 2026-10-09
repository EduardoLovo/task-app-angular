/**
 * Cabeçalhos de rate limit no formato draft-8 do IETF, iguais nas duas APIs:
 *
 *   RateLimit: "100-in-900sec"; r=97; t=894, "10-in-900sec"; r=9; t=894
 *   RateLimit-Policy: "100-in-900sec"; q=100; w=900; pk=:...:, "10-in-900sec"; q=10; w=900; pk=:...:
 *
 * Um item por limite aplicado à requisição (nas rotas /auth, o global e o de login).
 */

export interface RateLimitQuota {
  /** Nome da política, ex.: "100-in-900sec". */
  name: string;
  /** Requisições permitidas na janela (`q`), se o RateLimit-Policy veio. */
  limit: number | null;
  /** Tamanho da janela em segundos (`w`). */
  windowSeconds: number | null;
  /** Quantas ainda restam (`r`). */
  remaining: number;
  /** Quando a janela reinicia (agora + `t`). */
  resetAt: Date;
}

type Params = Record<string, string>;

// Um item: nome entre aspas seguido de parâmetros `; chave=valor`.
const ITEM_RE = /"([^"]*)"((?:\s*;\s*[a-z]+=[^,;]*)*)/gi;
const PARAM_RE = /;\s*([a-z]+)=([^,;]*)/gi;

function parseItems(header: string | null): Map<string, Params> {
  const items = new Map<string, Params>();
  if (!header) return items;
  for (const [, name, rawParams] of header.matchAll(ITEM_RE)) {
    const params: Params = {};
    for (const [, key, value] of rawParams.matchAll(PARAM_RE)) params[key.toLowerCase()] = value.trim();
    items.set(name, params);
  }
  return items;
}

function toInt(value: string | undefined): number | null {
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
}

/** Junta RateLimit e RateLimit-Policy por política. Itens sem `r` ou `t` válidos são ignorados. */
export function parseRateLimit(
  rateLimit: string | null,
  policy: string | null,
  now: Date = new Date(),
): RateLimitQuota[] {
  const policies = parseItems(policy);
  const quotas: RateLimitQuota[] = [];
  for (const [name, params] of parseItems(rateLimit)) {
    const remaining = toInt(params['r']);
    const resetSeconds = toInt(params['t']);
    if (remaining === null || resetSeconds === null) continue;
    const policyParams = policies.get(name) ?? {};
    quotas.push({
      name,
      limit: toInt(policyParams['q']),
      windowSeconds: toInt(policyParams['w']),
      remaining,
      resetAt: new Date(now.getTime() + resetSeconds * 1000),
    });
  }
  return quotas;
}

/** Retry-After em segundos. As APIs mandam segundos; uma data HTTP também é aceita, como manda o padrão. */
export function parseRetryAfter(value: string | null, now: Date = new Date()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now.getTime()) / 1000));
}

/** "15 min", "1 h", "30 s": para mostrar o tamanho da janela. */
export function formatDuration(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  return `${seconds} s`;
}

/** Restam 20% ou menos: vale avisar. */
export function isRunningLow(quota: RateLimitQuota): boolean {
  return quota.limit !== null && quota.remaining <= quota.limit * 0.2;
}
