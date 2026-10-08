import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiId, ApiSelector } from './api-selector.service';
import { AuthResult, User } from './api.models';
import { readStorage, writeStorage } from './storage';

export interface Session {
  token: string;
  user: User;
}

type Sessions = Partial<Record<ApiId, Session>>;

const STORAGE_KEY = 'task-app:sessions';

/**
 * Uma sessão por API: cada uma tem o seu banco de usuários e recusa tokens emitidos pela outra
 * (claim `iss`), então trocar de API no seletor não leva o login junto.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiSelector);
  private readonly sessions = signal<Sessions>(this.load());

  /** Sessão da API selecionada no momento. */
  readonly current = computed(() => this.sessions()[this.api.id()] ?? null);
  readonly isLoggedIn = computed(() => this.current() !== null);

  get(id: ApiId): Session | null {
    return this.sessions()[id] ?? null;
  }

  start(id: ApiId, result: AuthResult): void {
    this.save({ ...this.sessions(), [id]: { token: result.accessToken, user: result.user } });
  }

  end(id: ApiId): void {
    const next = { ...this.sessions() };
    delete next[id];
    this.save(next);
  }

  private save(sessions: Sessions): void {
    this.sessions.set(sessions);
    writeStorage(STORAGE_KEY, JSON.stringify(sessions));
  }

  private load(): Sessions {
    try {
      const parsed: unknown = JSON.parse(readStorage(STORAGE_KEY) ?? '{}');
      return typeof parsed === 'object' && parsed !== null ? (parsed as Sessions) : {};
    } catch {
      return {};
    }
  }
}
