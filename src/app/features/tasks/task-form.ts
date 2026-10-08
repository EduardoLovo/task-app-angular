import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../core/api-error';
import { ApiSelector } from '../../core/api-selector.service';
import {
  ErrorDetail,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TaskInput,
  TaskPriority,
  TaskStatus,
} from '../../core/api.models';
import { TasksService } from '../../core/tasks.service';
import { ErrorAlert } from '../../shared/error-alert';
import { applyServerErrors, controlMessages, setClientValidation } from '../../shared/form-errors';

type Field = 'title' | 'description' | 'status' | 'priority' | 'dueDate';

// Mesmas regras das APIs (tasks.schemas / schemas.py).
const VALIDATORS: Record<Field, ValidatorFn[]> = {
  title: [Validators.required, Validators.maxLength(120)],
  description: [Validators.maxLength(1000)],
  status: [Validators.required],
  priority: [Validators.required],
  dueDate: [Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)],
};

const MESSAGES: Record<Field, Record<string, string>> = {
  title: { required: 'Título é obrigatório', maxlength: 'Título deve ter no máximo 120 caracteres' },
  description: { maxlength: 'Descrição deve ter no máximo 1000 caracteres' },
  status: { required: 'Status é obrigatório' },
  priority: { required: 'Prioridade é obrigatória' },
  dueDate: { pattern: 'Data deve estar no formato AAAA-MM-DD' },
};

@Component({
  selector: 'app-task-form',
  imports: [ReactiveFormsModule, RouterLink, ErrorAlert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-form.html',
  styleUrl: './task-form.css',
})
export class TaskForm {
  private readonly tasksService = inject(TasksService);
  private readonly router = inject(Router);
  protected readonly api = inject(ApiSelector);

  /**
   * Parâmetro `:id` da rota; ausente em /tarefas/nova. Vai para a API como veio: em /tarefas/abc,
   * quem recusa é ela, e o erro aparece na tela.
   */
  readonly id = input<string>();

  protected readonly isEdit = computed(() => this.id() !== undefined);

  protected readonly statusOptions = Object.entries(STATUS_LABELS) as [TaskStatus, string][];
  protected readonly priorityOptions = Object.entries(PRIORITY_LABELS) as [TaskPriority, string][];

  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly otherDetails = signal<ErrorDetail[]>([]);
  protected readonly clientValidation = signal(true);

  protected readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    status: new FormControl<TaskStatus>('pending', { nonNullable: true }),
    priority: new FormControl<TaskPriority>('medium', { nonNullable: true }),
    dueDate: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    setClientValidation(this.form, VALIDATORS, true);

    effect(() => {
      if (this.isEdit()) untracked(() => this.load());
    });

    // A tarefa pertence ao banco de uma API; ao trocar de API, volta para a lista.
    const startApi = this.api.id();
    effect(() => {
      if (this.api.id() !== startApi) untracked(() => void this.router.navigate(['/tarefas']));
    });
  }

  protected messages(field: Field): string[] {
    return controlMessages(this.form.controls[field], MESSAGES[field]);
  }

  protected toggleClientValidation(enabled: boolean): void {
    this.clientValidation.set(enabled);
    setClientValidation(this.form, VALIDATORS, enabled);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const input: TaskInput = {
      title: value.title.trim(),
      description: value.description.trim() || null,
      status: value.status,
      priority: value.priority,
      dueDate: value.dueDate || null,
    };

    this.submitting.set(true);
    this.clearErrors();
    const request = this.isEdit() ? this.tasksService.update(this.id() ?? '', input) : this.tasksService.create(input);

    request.pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: () => void this.router.navigate(['/tarefas']),
      error: (error: unknown) => this.showError(error),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.clearErrors();
    this.tasksService
      .get(this.id() ?? '')
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (task) =>
          this.form.reset({
            title: task.title,
            description: task.description ?? '',
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate ?? '',
          }),
        error: (error: unknown) => this.showError(error),
      });
  }

  private clearErrors(): void {
    this.error.set(null);
    this.otherDetails.set([]);
  }

  private showError(error: unknown): void {
    if (!(error instanceof ApiError)) throw error;
    this.error.set(error);
    this.otherDetails.set(applyServerErrors(this.form, error));
  }
}
