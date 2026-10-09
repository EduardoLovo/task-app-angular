import { Injectable, signal } from '@angular/core';
import { ApiId } from './api-selector.service';
import { RateLimitQuota } from './rate-limit';

type Quotas = Partial<Record<ApiId, RateLimitQuota[]>>;

/**
 * Último valor conhecido de cada limite, por API. Uma resposta comum traz só o limite global; as de /auth trazem
 * também o de login. Por isso cada resposta atualiza as políticas que trouxe e mantém as outras.
 */
@Injectable({ providedIn: 'root' })
export class RateLimitStore {
  private readonly quotas = signal<Quotas>({});

  readonly all = this.quotas.asReadonly();

  update(id: ApiId, received: RateLimitQuota[]): void {
    if (!received.length) return;
    this.quotas.update((quotas) => {
      const byName = new Map((quotas[id] ?? []).map((quota) => [quota.name, quota]));
      for (const quota of received) byName.set(quota.name, quota);
      // Maior limite primeiro: o global antes do de login.
      const merged = [...byName.values()].sort((a, b) => (b.limit ?? 0) - (a.limit ?? 0));
      return { ...quotas, [id]: merged };
    });
  }
}
