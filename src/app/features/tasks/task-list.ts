import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiError } from '../../core/api-error';
import { ApiSelector } from '../../core/api-selector.service';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  SortBy,
  SortOrder,
  Task,
  TaskPriority,
  TaskQuery,
  TaskStatus,
} from '../../core/api.models';
import { TasksService } from '../../core/tasks.service';
import { ErrorAlert } from '../../shared/error-alert';

interface Filters {
  status: TaskStatus | '';
  priority: TaskPriority | '';
  search: string;
  sortBy: SortBy;
  order: SortOrder;
  limit: number;
}

const INITIAL_FILTERS: Filters = {
  status: '',
  priority: '',
  search: '',
  sortBy: 'createdAt',
  order: 'desc',
  limit: 10,
};

@Component({
  selector: 'app-task-list',
  imports: [RouterLink, DatePipe, ErrorAlert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-list.html',
  styleUrl: './task-list.css',
})
export class TaskList {
  private readonly tasksService = inject(TasksService);
  protected readonly api = inject(ApiSelector);

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly statusOptions = Object.entries(STATUS_LABELS) as [TaskStatus, string][];
  protected readonly priorityOptions = Object.entries(PRIORITY_LABELS) as [TaskPriority, string][];

  protected readonly filters = signal<Filters>(INITIAL_FILTERS);
  /** Volta para a página 1 sempre que um filtro (ou a API) muda. */
  protected readonly page = linkedSignal({
    source: () => ({ filters: this.filters(), api: this.api.id() }),
    computation: () => 1,
  });

  protected readonly tasks = rxResource({
    params: () => ({ api: this.api.id(), query: { ...this.filters(), page: this.page() } as TaskQuery }),
    stream: ({ params }) => this.tasksService.list(params.query),
  });

  protected readonly items = computed<Task[]>(() => (this.tasks.hasValue() ? this.tasks.value().data : []));
  protected readonly meta = computed(() => (this.tasks.hasValue() ? this.tasks.value().meta : null));
  protected readonly loadError = computed(() => {
    const error = this.tasks.error();
    return error instanceof ApiError ? error : null;
  });

  protected readonly actionError = signal<ApiError | null>(null);
  protected readonly busyId = signal<number | null>(null);

  protected setFilter<K extends keyof Filters>(key: K, value: Filters[K]): void {
    this.filters.update((filters) => ({ ...filters, [key]: value }));
  }

  protected clearFilters(): void {
    this.filters.set(INITIAL_FILTERS);
  }

  protected toggleDone(task: Task): void {
    const status: TaskStatus = task.status === 'done' ? 'pending' : 'done';
    this.runAction(task.id, () => this.tasksService.update(task.id, { status }));
  }

  protected remove(task: Task): void {
    if (!confirm(`Excluir a tarefa "${task.title}"?`)) return;
    this.runAction(task.id, () => this.tasksService.remove(task.id));
  }

  private runAction(id: number, action: () => Observable<unknown>): void {
    this.busyId.set(id);
    this.actionError.set(null);
    action().subscribe({
      next: () => {
        this.busyId.set(null);
        this.tasks.reload();
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        if (error instanceof ApiError) this.actionError.set(error);
        else throw error;
      },
    });
  }
}
