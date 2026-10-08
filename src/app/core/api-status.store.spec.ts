import { TestBed } from '@angular/core/testing';
import { AWAKE_WINDOW_MS, ApiStatusStore } from './api-status.store';

describe('ApiStatusStore', () => {
  it('considera a API acordada só por um tempo depois da última resposta', () => {
    const status = TestBed.inject(ApiStatusStore);
    expect(status.isAwake('express', 0)).toBe(false);

    status.markResponse('express', 1_000);

    expect(status.isAwake('express', 1_000 + AWAKE_WINDOW_MS - 1)).toBe(true);
    expect(status.isAwake('express', 1_000 + AWAKE_WINDOW_MS)).toBe(false);
    expect(status.isAwake('flask', 1_000)).toBe(false);
  });

  it('conta as requisições demoradas de cada API', () => {
    const status = TestBed.inject(ApiStatusStore);

    status.slowStarted('flask');
    status.slowStarted('flask');
    status.slowFinished('flask');
    expect(status.waking().map((target) => target.id)).toEqual(['flask']);

    status.slowFinished('flask');
    expect(status.waking()).toEqual([]);
  });
});
