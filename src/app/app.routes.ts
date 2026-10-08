import { Routes } from '@angular/router';
import { requireGuest, requireSession } from './core/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tarefas' },
  {
    path: 'login',
    title: 'Entrar · Task App',
    canActivate: [requireGuest],
    data: { mode: 'login' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'cadastro',
    title: 'Criar conta · Task App',
    canActivate: [requireGuest],
    data: { mode: 'register' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'tarefas',
    canActivate: [requireSession],
    children: [
      {
        path: '',
        title: 'Tarefas · Task App',
        loadComponent: () => import('./features/tasks/task-list').then((m) => m.TaskList),
      },
      {
        path: 'nova',
        title: 'Nova tarefa · Task App',
        loadComponent: () => import('./features/tasks/task-form').then((m) => m.TaskForm),
      },
      {
        path: ':id',
        title: 'Editar tarefa · Task App',
        loadComponent: () => import('./features/tasks/task-form').then((m) => m.TaskForm),
      },
    ],
  },
  {
    path: 'erros',
    title: 'Testar erros · Task App',
    loadComponent: () => import('./features/error-lab/error-lab').then((m) => m.ErrorLab),
  },
  { path: '**', redirectTo: 'tarefas' },
];
