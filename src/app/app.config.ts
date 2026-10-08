import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { apiErrorInterceptor, authInterceptor, coldStartInterceptor, inspectorInterceptor } from './core/interceptors';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Ordem importa: o primeiro é o mais externo. O inspetor fica colado na rede para registrar a
    // requisição já com o token e a resposta antes de virar `ApiError`.
    provideHttpClient(
      withFetch(),
      withInterceptors([apiErrorInterceptor, coldStartInterceptor, authInterceptor, inspectorInterceptor]),
    ),
  ],
};
