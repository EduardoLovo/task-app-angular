import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RateLimitQuota, formatDuration, isRunningLow } from '../core/rate-limit';

/** Um limite de requisições: quantas restam, de quantas, e quando a janela renova. */
@Component({
  selector: 'app-rate-limit-meter',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let q = quota();
    <div class="meter" [class.low]="low()" [class.expired]="expired()">
      <div class="line">
        <span class="policy">{{ policyLabel() }}</span>
        <span class="count">
          @if (expired()) {
            janela renovada
          } @else {
            <strong>{{ q.remaining }}</strong>
            @if (q.limit !== null) {
              de {{ q.limit }}
            }
            restantes
          }
        </span>
      </div>
      @if (q.limit !== null && !expired()) {
        <div
          class="bar"
          role="meter"
          [attr.aria-valuenow]="q.remaining"
          aria-valuemin="0"
          [attr.aria-valuemax]="q.limit"
          [attr.aria-label]="policyLabel()"
        >
          <span [style.width.%]="percent()"></span>
        </div>
      }
      @if (!expired()) {
        <small class="muted">renova às {{ q.resetAt | date: 'HH:mm:ss' }}</small>
      }
    </div>
  `,
  styles: `
    .meter {
      display: grid;
      gap: 0.2rem;
      font-size: 0.8rem;
    }
    .line {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .policy {
      color: var(--muted);
    }
    .bar {
      height: 6px;
      border-radius: 999px;
      background: var(--code-bg);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--ok);
    }
    .low .bar span {
      background: var(--error-text);
    }
    .low .count {
      color: var(--error-text);
    }
    .expired {
      opacity: 0.6;
    }
  `,
})
export class RateLimitMeter {
  readonly quota = input.required<RateLimitQuota>();

  protected readonly low = computed(() => isRunningLow(this.quota()));
  // Calculado quando o valor chega ou a tela é redesenhada; não precisa de relógio rodando.
  protected readonly expired = computed(() => this.quota().resetAt.getTime() <= Date.now());
  protected readonly percent = computed(() => {
    const { remaining, limit } = this.quota();
    return limit ? Math.round((remaining / limit) * 100) : 0;
  });
  protected readonly policyLabel = computed(() => {
    const { name, limit, windowSeconds } = this.quota();
    return limit !== null && windowSeconds !== null ? `${limit} a cada ${formatDuration(windowSeconds)}` : name;
  });
}
