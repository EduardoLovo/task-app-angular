import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ApiError } from '../core/api-error';
import { ErrorDetail } from '../core/api.models';
import { formatDuration } from '../core/rate-limit';

/** Mostra um `ApiError` do jeito que a API mandou: mensagem, `code`, `details` e `requestId`. */
@Component({
  selector: 'app-error-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as error) {
      <div class="alert" role="alert">
        <div class="alert-head">
          <strong>{{ error.message }}</strong>
          <span class="badge badge-error">{{ error.status || '—' }} · {{ error.code }}</span>
        </div>
        @if (details().length) {
          <ul class="alert-details">
            @for (detail of details(); track $index) {
              <li>
                <code>{{ detail.location }}.{{ detail.field }}</code> {{ detail.message }}
              </li>
            }
          </ul>
        }
        @if (error.retryAfter !== null) {
          <span>Tente de novo em {{ duration(error.retryAfter) }}.</span>
        }
        @if (error.requestId) {
          <small class="muted"
            >requestId: <code>{{ error.requestId }}</code></small
          >
        }
      </div>
    }
  `,
  styles: `
    .alert {
      border: 1px solid var(--error-border);
      background: var(--error-bg);
      color: var(--error-text);
      border-radius: var(--radius);
      padding: 0.75rem 1rem;
      display: grid;
      gap: 0.4rem;
    }
    .alert-head {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      justify-content: space-between;
    }
    .alert-details {
      margin: 0;
      padding-left: 1.1rem;
    }
  `,
})
export class ErrorAlert {
  readonly error = input<ApiError | null>(null);
  /** Itens de `details` que não foram exibidos junto de um campo do formulário. */
  readonly details = input<ErrorDetail[]>([]);

  protected readonly duration = formatDuration;
}
