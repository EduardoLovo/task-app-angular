import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { readStorage, writeStorage } from './storage';

export type ApiId = 'express' | 'flask';

export interface ApiTarget {
  id: ApiId;
  name: string;
  stack: string;
  baseUrl: string;
}

export const API_TARGETS: Record<ApiId, ApiTarget> = {
  express: { id: 'express', name: 'Express', stack: 'Node.js + Express 5', baseUrl: environment.apis.express },
  flask: { id: 'flask', name: 'Flask', stack: 'Python + Flask 3', baseUrl: environment.apis.flask },
};

const STORAGE_KEY = 'task-app:api';

function isApiId(value: unknown): value is ApiId {
  return value === 'express' || value === 'flask';
}

/** Guarda qual das duas APIs o front está usando. Os serviços montam as URLs a partir daqui. */
@Injectable({ providedIn: 'root' })
export class ApiSelector {
  private readonly selected = signal<ApiId>(this.initial());

  readonly id = this.selected.asReadonly();
  readonly current = computed(() => API_TARGETS[this.selected()]);
  readonly targets = Object.values(API_TARGETS);

  select(id: ApiId): void {
    this.selected.set(id);
    writeStorage(STORAGE_KEY, id);
  }

  /** URL completa na API escolhida (ou na indicada). */
  url(path: string, id: ApiId = this.selected()): string {
    return `${API_TARGETS[id].baseUrl}${path}`;
  }

  /** Descobre para qual das APIs vai uma URL absoluta. */
  targetOf(url: string): ApiTarget | undefined {
    return this.targets.find((target) => url === target.baseUrl || url.startsWith(`${target.baseUrl}/`));
  }

  private initial(): ApiId {
    const stored = readStorage(STORAGE_KEY);
    return isApiId(stored) ? stored : 'express';
  }
}
