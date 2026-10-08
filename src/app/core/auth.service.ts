import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ApiSelector } from './api-selector.service';
import { AuthResult, DataResponse, User } from './api.models';
import { labeled } from './http-context';
import { SessionStore } from './session.store';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiSelector);
  private readonly sessions = inject(SessionStore);

  register(input: RegisterInput): Observable<User> {
    const id = this.api.id();
    return this.http
      .post<DataResponse<AuthResult>>(this.api.url('/auth/register', id), input, { context: labeled('Cadastro') })
      .pipe(
        tap(({ data }) => this.sessions.start(id, data)),
        map(({ data }) => data.user),
      );
  }

  login(input: LoginInput): Observable<User> {
    const id = this.api.id();
    return this.http
      .post<DataResponse<AuthResult>>(this.api.url('/auth/login', id), input, { context: labeled('Login') })
      .pipe(
        tap(({ data }) => this.sessions.start(id, data)),
        map(({ data }) => data.user),
      );
  }

  /** Só encerra a sessão local: as APIs usam JWT sem estado, não há rota de logout. */
  logout(): void {
    this.sessions.end(this.api.id());
  }
}
