import { TestBed } from '@angular/core/testing';
import { ApiSelector } from './api-selector.service';
import { AuthResult } from './api.models';
import { SessionStore } from './session.store';

const RESULT: AuthResult = {
  user: { id: 1, name: 'Ana', email: 'ana@exemplo.com', createdAt: '2026-10-08T00:00:00.000Z' },
  accessToken: 'token-express',
  tokenType: 'Bearer',
  expiresIn: '1h',
};

describe('SessionStore', () => {
  beforeEach(() => localStorage.clear());

  it('mantém uma sessão separada para cada API', () => {
    const api = TestBed.inject(ApiSelector);
    const sessions = TestBed.inject(SessionStore);

    api.select('express');
    sessions.start('express', RESULT);
    expect(sessions.isLoggedIn()).toBe(true);

    // Trocar de API não leva o login junto.
    api.select('flask');
    expect(sessions.isLoggedIn()).toBe(false);
    expect(sessions.current()).toBeNull();

    api.select('express');
    expect(sessions.current()?.token).toBe('token-express');
  });

  it('lembra as sessões e a API escolhida entre recarregamentos', () => {
    TestBed.inject(ApiSelector).select('flask');
    TestBed.inject(SessionStore).start('flask', RESULT);

    TestBed.resetTestingModule();

    expect(TestBed.inject(ApiSelector).id()).toBe('flask');
    expect(TestBed.inject(SessionStore).current()?.user.name).toBe('Ana');
  });

  it('encerra só a sessão da API indicada', () => {
    const sessions = TestBed.inject(SessionStore);
    sessions.start('express', RESULT);
    sessions.start('flask', { ...RESULT, accessToken: 'token-flask' });

    sessions.end('express');

    expect(sessions.get('express')).toBeNull();
    expect(sessions.get('flask')?.token).toBe('token-flask');
  });
});
