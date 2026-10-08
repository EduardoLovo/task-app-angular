import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiId, ApiSelector } from './core/api-selector.service';
import { AuthService } from './core/auth.service';
import { InspectorStore } from './core/inspector.store';
import { SessionStore } from './core/session.store';
import { InspectorPanel } from './shared/inspector-panel';

const PROTECTED_PREFIX = '/tarefas';
const GUEST_PATHS = ['/login', '/cadastro'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, InspectorPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly api = inject(ApiSelector);
  protected readonly session = inject(SessionStore);
  protected readonly inspector = inject(InspectorStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly panelOpen = signal(true);

  constructor() {
    // Cada API tem a sua sessão. Ao trocar de API (ou ao sair), leva para a tela que faz sentido.
    effect(() => {
      const loggedIn = this.session.isLoggedIn();
      untracked(() => {
        const path = this.router.url.split('?')[0];
        if (!loggedIn && path.startsWith(PROTECTED_PREFIX)) void this.router.navigate(['/login']);
        if (loggedIn && GUEST_PATHS.includes(path)) void this.router.navigate(['/tarefas']);
      });
    });
  }

  protected selectApi(id: ApiId): void {
    this.api.select(id);
  }

  protected logout(): void {
    this.auth.logout();
  }
}
