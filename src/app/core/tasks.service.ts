import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiSelector } from './api-selector.service';
import { DataResponse, ListResponse, Task, TaskInput, TaskQuery } from './api.models';
import { labeled } from './http-context';

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiSelector);

  list(query: TaskQuery): Observable<ListResponse<Task>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      // Filtro vazio não vai na query: a API recusaria `status=` como valor inválido.
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<ListResponse<Task>>(this.api.url('/tasks'), { params, context: labeled('Listar tarefas') });
  }

  get(id: number | string): Observable<Task> {
    return this.http
      .get<DataResponse<Task>>(this.api.url(`/tasks/${id}`), { context: labeled('Buscar tarefa') })
      .pipe(map(({ data }) => data));
  }

  create(input: TaskInput): Observable<Task> {
    return this.http
      .post<DataResponse<Task>>(this.api.url('/tasks'), input, { context: labeled('Criar tarefa') })
      .pipe(map(({ data }) => data));
  }

  update(id: number | string, changes: Partial<TaskInput>): Observable<Task> {
    return this.http
      .patch<DataResponse<Task>>(this.api.url(`/tasks/${id}`), changes, { context: labeled('Atualizar tarefa') })
      .pipe(map(({ data }) => data));
  }

  remove(id: number | string): Observable<void> {
    return this.http
      .delete<void>(this.api.url(`/tasks/${id}`), { context: labeled('Excluir tarefa') })
      .pipe(map(() => undefined));
  }
}
