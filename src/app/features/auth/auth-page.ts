import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError } from '../../core/api-error';
import { ApiSelector } from '../../core/api-selector.service';
import { ErrorDetail } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { ErrorAlert } from '../../shared/error-alert';
import { applyServerErrors, controlMessages, setClientValidation } from '../../shared/form-errors';

type Mode = 'login' | 'register';

// Mesmas regras das APIs (auth.schemas / schemas.py).
const VALIDATORS: Record<string, ValidatorFn[]> = {
  name: [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
  email: [Validators.required, Validators.email, Validators.maxLength(254)],
  password: [Validators.required, Validators.minLength(8)],
};

const MESSAGES: Record<string, Record<string, string>> = {
  name: {
    required: 'Nome é obrigatório',
    minlength: 'Nome deve ter pelo menos 2 caracteres',
    maxlength: 'Nome deve ter no máximo 100 caracteres',
  },
  email: {
    required: 'E-mail é obrigatório',
    email: 'E-mail inválido',
    maxlength: 'E-mail deve ter no máximo 254 caracteres',
  },
  password: {
    required: 'Senha é obrigatória',
    minlength: 'Senha deve ter pelo menos 8 caracteres',
  },
};

@Component({
  selector: 'app-auth-page',
  imports: [ReactiveFormsModule, RouterLink, ErrorAlert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.css',
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly api = inject(ApiSelector);

  /** Vem do `data` da rota. */
  readonly mode = input<Mode>('login');
  /** Vem da query string (`?motivo=sessao-expirada`). */
  readonly motivo = input<string>();

  protected readonly demo = environment.demo;
  protected readonly isRegister = computed(() => this.mode() === 'register');
  protected readonly submitting = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly otherDetails = signal<ErrorDetail[]>([]);
  protected readonly clientValidation = signal(true);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    setClientValidation(this.form, VALIDATORS, true);
  }

  protected messages(field: 'name' | 'email' | 'password'): string[] {
    return controlMessages(this.form.controls[field], MESSAGES[field]);
  }

  protected toggleClientValidation(enabled: boolean): void {
    this.clientValidation.set(enabled);
    setClientValidation(this.form, VALIDATORS, enabled);
  }

  protected submit(): void {
    // O nome só existe no cadastro; no login ele nem vai no corpo (a API recusa campos extras).
    const { name, ...credentials } = this.form.getRawValue();
    const nameControl = this.form.controls.name;
    if (this.isRegister()) nameControl.enable();
    else nameControl.disable();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    this.otherDetails.set([]);

    const request = this.isRegister() ? this.auth.register({ name, ...credentials }) : this.auth.login(credentials);
    request.pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: () => void this.router.navigate(['/tarefas']),
      error: (error: unknown) => {
        if (!(error instanceof ApiError)) throw error;
        this.error.set(error);
        this.otherDetails.set(applyServerErrors(this.form, error));
      },
    });
  }
}
