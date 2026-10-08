import { HttpClient, HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';
import { ApiId, ApiSelector } from './core/api-selector.service';
import { ApiStatusStore } from './core/api-status.store';
import { AuthService } from './core/auth.service';
import { ATTACH_SESSION_TOKEN, labeled } from './core/http-context';
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
  protected readonly status = inject(ApiStatusStore);
  protected readonly demo = environment.demo;
  private readonly http = inject(HttpClient);
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

    // Ao escolher uma API que pode estar dormindo, já começa a acordá-la enquanto o usuário preenche o login.
    effect(() => {
      const id = this.api.id();
      untracked(() => this.wake(id));
    });
  }

  protected selectApi(id: ApiId): void {
    this.api.select(id);
  }

  protected logout(): void {
    this.auth.logout();
  }

  private wake(id: ApiId): void {
    if (this.status.isAwake(id)) return;
    const context: HttpContext = labeled('Acordar API').set(ATTACH_SESSION_TOKEN, false);
    // Falhas aqui não importam: a próxima requisição de verdade mostra o erro.
    this.http.get(this.api.url('/health', id), { context }).subscribe({ error: () => undefined });
  }
}
