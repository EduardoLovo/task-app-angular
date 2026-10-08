import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session.store';

/** Rotas que exigem login na API selecionada. */
export const requireSession: CanActivateFn = () =>
  inject(SessionStore).isLoggedIn() || inject(Router).createUrlTree(['/login']);

/** Login e cadastro: quem já tem sessão vai direto para as tarefas. */
export const requireGuest: CanActivateFn = () =>
  !inject(SessionStore).isLoggedIn() || inject(Router).createUrlTree(['/tarefas']);
