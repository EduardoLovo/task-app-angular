import { Injectable, computed, signal } from '@angular/core';

export interface InspectedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface InspectedResponse {
  status: number;
  statusText: string;
  requestId: string | null;
  body: unknown;
}

export interface InspectorEntry {
  id: number;
  api: string;
  label: string | null;
  startedAt: Date;
  durationMs: number | null;
  request: InspectedRequest;
  response: InspectedResponse | null;
}

const MAX_ENTRIES = 30;

/** Histórico das requisições enviadas, exibido no painel "por baixo dos panos". */
@Injectable({ providedIn: 'root' })
export class InspectorStore {
  private nextId = 1;
  private readonly items = signal<InspectorEntry[]>([]);

  /** Mais recente primeiro. */
  readonly entries = this.items.asReadonly();
  readonly errorCount = computed(() => this.items().filter((entry) => (entry.response?.status ?? 0) >= 400).length);

  start(api: string, label: string | null, request: InspectedRequest): number {
    const id = this.nextId++;
    const entry: InspectorEntry = {
      id,
      api,
      label,
      startedAt: new Date(),
      durationMs: null,
      request,
      response: null,
    };
    this.items.update((items) => [entry, ...items].slice(0, MAX_ENTRIES));
    return id;
  }

  finish(id: number, response: InspectedResponse): void {
    this.items.update((items) =>
      items.map((entry) =>
        entry.id === id ? { ...entry, response, durationMs: Date.now() - entry.startedAt.getTime() } : entry,
      ),
    );
  }

  clear(): void {
    this.items.set([]);
  }
}
