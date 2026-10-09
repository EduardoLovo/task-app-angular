import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ApiSelector } from '../core/api-selector.service';
import { InspectorEntry, InspectorStore } from '../core/inspector.store';
import { RateLimitStore } from '../core/rate-limit.store';
import { RateLimitMeter } from './rate-limit-meter';

/** Painel "por baixo dos panos": a requisição como saiu e a resposta crua da API. */
@Component({
  selector: 'app-inspector-panel',
  imports: [DatePipe, RateLimitMeter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inspector-panel.html',
  styleUrl: './inspector-panel.css',
})
export class InspectorPanel {
  protected readonly inspector = inject(InspectorStore);
  protected readonly rateLimits = inject(RateLimitStore);
  protected readonly api = inject(ApiSelector);

  protected path(entry: InspectorEntry): string {
    try {
      const url = new URL(entry.request.url);
      return decodeURIComponent(url.pathname + url.search);
    } catch {
      return entry.request.url;
    }
  }

  protected errorCode(entry: InspectorEntry): string | null {
    const body = entry.response?.body as { error?: { code?: unknown } } | null | undefined;
    return typeof body?.error?.code === 'string' ? body.error.code : null;
  }

  protected statusClass(entry: InspectorEntry): string {
    const status = entry.response?.status;
    if (status === undefined) return 'badge';
    if (status === 0 || status >= 400) return 'badge badge-error';
    return 'badge badge-ok';
  }

  protected pretty(value: unknown): string {
    if (value === null || value === undefined) return '(vazio)';
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  }

  protected hasHeaders(entry: InspectorEntry): boolean {
    return Object.keys(entry.request.headers).length > 0;
  }
}
