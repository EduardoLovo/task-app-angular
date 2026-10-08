import { Injectable, computed, signal } from '@angular/core';
import { API_TARGETS, ApiId } from './api-selector.service';

/** O Render põe a API para dormir depois de 15 min sem acesso; 14 min deixa margem. */
export const AWAKE_WINDOW_MS = 14 * 60 * 1000;

/**
 * Acompanha se cada API está acordada. No plano free do Render, a primeira requisição depois da soneca leva de 15 a
 * 60 s (cold start); sabendo disso, o front mostra um aviso e espera mais antes de desistir.
 */
@Injectable({ providedIn: 'root' })
export class ApiStatusStore {
  private readonly lastResponse: Partial<Record<ApiId, number>> = {};
  /** Requisições demoradas em andamento, por API. */
  private readonly slow = signal<Partial<Record<ApiId, number>>>({});

  /** APIs que estão demorando para responder (provavelmente acordando). */
  readonly waking = computed(() =>
    (Object.keys(this.slow()) as ApiId[]).filter((id) => (this.slow()[id] ?? 0) > 0).map((id) => API_TARGETS[id]),
  );

  /** Respondeu há pouco tempo, então não deve estar dormindo. */
  isAwake(id: ApiId, now = Date.now()): boolean {
    const last = this.lastResponse[id];
    return last !== undefined && now - last < AWAKE_WINDOW_MS;
  }

  markResponse(id: ApiId, now = Date.now()): void {
    this.lastResponse[id] = now;
  }

  slowStarted(id: ApiId): void {
    this.slow.update((slow) => ({ ...slow, [id]: (slow[id] ?? 0) + 1 }));
  }

  slowFinished(id: ApiId): void {
    this.slow.update((slow) => ({ ...slow, [id]: Math.max((slow[id] ?? 0) - 1, 0) }));
  }
}
