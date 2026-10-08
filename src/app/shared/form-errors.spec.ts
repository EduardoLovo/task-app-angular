import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ApiError } from '../core/api-error';
import { applyServerErrors, controlMessages, setClientValidation } from './form-errors';

describe('form-errors', () => {
  function buildForm() {
    return new FormGroup({
      title: new FormControl('', { nonNullable: true }),
      status: new FormControl('pending', { nonNullable: true }),
    });
  }

  it('coloca cada item de details no campo correspondente', () => {
    const form = buildForm();
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Dados inválidos', [
      { location: 'body', field: 'title', message: 'Título é obrigatório' },
      { location: 'body', field: 'cor', message: 'Campo não permitido' },
      { location: 'query', field: 'status', message: 'Não é deste formulário' },
    ]);

    const unmatched = applyServerErrors(form, error);

    expect(controlMessages(form.controls.title, {})).toEqual(['Título é obrigatório']);
    expect(form.controls.status.valid).toBe(true);
    expect(unmatched.map((detail) => detail.field)).toEqual(['cor', 'status']);
  });

  it('o erro da API some quando o usuário edita o campo', () => {
    const form = buildForm();
    applyServerErrors(
      form,
      new ApiError(400, 'VALIDATION_ERROR', 'x', [{ location: 'body', field: 'title', message: 'Inválido' }]),
    );

    form.controls.title.setValue('Novo título');

    expect(form.controls.title.errors).toBeNull();
  });

  it('só mostra mensagens depois que o campo foi tocado', () => {
    const control = new FormControl('', { validators: Validators.required });
    const messages = { required: 'Obrigatório' };

    expect(controlMessages(control, messages)).toEqual([]);
    control.markAsTouched();
    expect(controlMessages(control, messages)).toEqual(['Obrigatório']);
  });

  it('liga e desliga a validação do front', () => {
    const form = buildForm();
    const validators = { title: [Validators.required] };

    setClientValidation(form, validators, true);
    expect(form.valid).toBe(false);

    setClientValidation(form, validators, false);
    expect(form.valid).toBe(true);
  });
});
