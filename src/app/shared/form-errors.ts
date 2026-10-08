import { AbstractControl, FormGroup, ValidatorFn } from '@angular/forms';
import { ApiError } from '../core/api-error';
import { ErrorDetail } from '../core/api.models';

/**
 * Mensagens de um campo: as dos validadores do front (pelo nome do erro) e as que a API devolveu
 * em `details` (erro `server`). Só aparecem depois que o usuário mexeu no campo ou tentou enviar.
 */
export function controlMessages(control: AbstractControl, messages: Record<string, string>): string[] {
  if (!control.errors || !(control.touched || control.dirty)) return [];
  return Object.entries(control.errors).map(([key, value]) =>
    key === 'server' ? String(value) : (messages[key] ?? 'Valor inválido'),
  );
}

/**
 * Coloca cada item de `details` no campo correspondente do formulário. O erro some sozinho quando o
 * usuário edita o campo, porque a validação roda de novo. Devolve os itens sem campo no formulário.
 */
export function applyServerErrors(form: FormGroup, error: ApiError): ErrorDetail[] {
  const unmatched: ErrorDetail[] = [];
  for (const detail of error.details) {
    const control = detail.location === 'body' ? form.get(detail.field) : null;
    if (control) {
      control.setErrors({ ...control.errors, server: detail.message });
      control.markAsTouched();
    } else {
      unmatched.push(detail);
    }
  }
  return unmatched;
}

/**
 * Liga ou desliga a validação do front, para mostrar que a API valida por conta própria (e com as
 * mesmas regras).
 */
export function setClientValidation(form: FormGroup, validators: Record<string, ValidatorFn[]>, enabled: boolean) {
  for (const [name, list] of Object.entries(validators)) {
    const control = form.get(name);
    if (!control) continue;
    control.setValidators(enabled ? list : []);
    control.updateValueAndValidity();
  }
}
