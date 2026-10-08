import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../core/api-error';
import { ApiId, ApiSelector } from '../../core/api-selector.service';
import { ATTACH_SESSION_TOKEN, labeled } from '../../core/http-context';
import { SessionStore } from '../../core/session.store';
import { OTHER_API, SCENARIOS, Scenario, ScenarioRequest } from './scenarios';

export interface ScenarioResult {
  status: number;
  code: string | null;
  message: string;
  detailCount: number;
  matches: boolean;
}

type Cell = ScenarioResult | 'running' | { skipped: string };
type Results = Record<string, Partial<Record<ApiId, Cell>>>;

/**
 * Laboratório de erros: manda requisições inválidas de propósito para as duas APIs e compara o
 * `status` e o `code` de cada uma com o esperado pelo contrato.
 */
@Component({
  selector: 'app-error-lab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './error-lab.html',
  styleUrl: './error-lab.css',
})
export class ErrorLab {
  private readonly http = inject(HttpClient);
  protected readonly api = inject(ApiSelector);
  protected readonly sessions = inject(SessionStore);

  protected readonly scenarios = SCENARIOS;
  protected readonly results = signal<Results>({});
  protected readonly runningAll = signal(false);

  protected readonly summary = computed(() => {
    let total = 0;
    let ok = 0;
    for (const cells of Object.values(this.results())) {
      for (const cell of Object.values(cells)) {
        if (isResult(cell)) {
          total++;
          if (cell.matches) ok++;
        }
      }
    }
    return { total, ok };
  });

  protected cell(scenario: Scenario, api: ApiId): Cell | undefined {
    return this.results()[scenario.id]?.[api];
  }

  protected asResult(cell: Cell | undefined): ScenarioResult | null {
    return isResult(cell) ? cell : null;
  }

  protected skippedReason(cell: Cell | undefined): string | null {
    return typeof cell === 'object' && 'skipped' in cell ? cell.skipped : null;
  }

  protected async runScenario(scenario: Scenario): Promise<void> {
    await Promise.all(this.api.targets.map((target) => this.run(scenario, target.id)));
  }

  protected async runAll(): Promise<void> {
    this.runningAll.set(true);
    try {
      // Um cenário por vez, para o painel de requisições ficar legível.
      for (const scenario of this.scenarios) await this.runScenario(scenario);
    } finally {
      this.runningAll.set(false);
    }
  }

  protected clear(): void {
    this.results.set({});
  }

  private async run(scenario: Scenario, api: ApiId): Promise<void> {
    const otherToken = this.sessions.get(OTHER_API[api])?.token ?? null;
    if (scenario.needsSession && !this.sessions.get(api)) {
      return this.setCell(scenario, api, { skipped: 'Faça login nesta API' });
    }
    if (scenario.needsOtherSession && !otherToken) {
      return this.setCell(scenario, api, { skipped: 'Faça login na outra API' });
    }

    this.setCell(scenario, api, 'running');
    const request = scenario.request({ otherToken });
    let context = labeled(`Teste: ${scenario.title}`);
    if (request.attachToken === false) context = context.set(ATTACH_SESSION_TOKEN, false);

    const result = await this.send(api, request, context);
    this.setCell(scenario, api, {
      ...result,
      matches: result.status === scenario.expectedStatus && result.code === scenario.expectedCode,
    });
  }

  private async send(
    api: ApiId,
    request: ScenarioRequest,
    context: HttpContext,
  ): Promise<Omit<ScenarioResult, 'matches'>> {
    const { method, path, body, headers } = request;
    try {
      const response = await firstValueFrom(
        this.http.request(method, this.api.url(path, api), { body, headers, context, observe: 'response' }),
      );
      return { status: response.status, code: null, message: 'A requisição deu certo', detailCount: 0 };
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      return { status: error.status, code: error.code, message: error.message, detailCount: error.details.length };
    }
  }

  private setCell(scenario: Scenario, api: ApiId, cell: Cell): void {
    this.results.update((results) => ({ ...results, [scenario.id]: { ...results[scenario.id], [api]: cell } }));
  }
}

function isResult(cell: Cell | undefined): cell is ScenarioResult {
  return typeof cell === 'object' && 'status' in cell;
}
