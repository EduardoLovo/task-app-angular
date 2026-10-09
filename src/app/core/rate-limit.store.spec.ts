import { TestBed } from '@angular/core/testing';
import { RateLimitQuota } from './rate-limit';
import { RateLimitStore } from './rate-limit.store';

function quota(name: string, limit: number, remaining: number): RateLimitQuota {
  return { name, limit, windowSeconds: 900, remaining, resetAt: new Date() };
}

describe('RateLimitStore', () => {
  it('atualiza as políticas recebidas e mantém as outras, por API', () => {
    const store = TestBed.inject(RateLimitStore);

    // Login: traz o limite global e o de autenticação.
    store.update('express', [quota('100-in-900sec', 100, 98), quota('10-in-900sec', 10, 9)]);
    // Rota comum: só o global.
    store.update('express', [quota('100-in-900sec', 100, 97)]);
    store.update('flask', [quota('100-in-900sec', 100, 50)]);

    expect(store.all().express?.map((q) => [q.name, q.remaining])).toEqual([
      ['100-in-900sec', 97],
      ['10-in-900sec', 9],
    ]);
    expect(store.all().flask?.map((q) => q.remaining)).toEqual([50]);
  });

  it('resposta sem cabeçalho de rate limit não apaga o que já se sabia', () => {
    const store = TestBed.inject(RateLimitStore);
    store.update('flask', [quota('100-in-900sec', 100, 80)]);

    store.update('flask', []);

    expect(store.all().flask?.[0].remaining).toBe(80);
  });
});
