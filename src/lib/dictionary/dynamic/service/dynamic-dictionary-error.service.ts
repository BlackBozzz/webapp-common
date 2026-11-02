import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { DynamicApiProblem } from '../dto/dynamic-dictionary.dto';

/** Привязывает сообщения Spring ProblemDetail к полям реактивной формы. */
@Injectable({ providedIn: 'root' })
export class DynamicDictionaryErrorService {
    message(error: unknown): string {
        if (!(error instanceof HttpErrorResponse)) return 'Не удалось выполнить операцию.';
        const problem = error.error as DynamicApiProblem | undefined;
        return problem?.detail || problem?.title || `Ошибка обращения к серверу (${error.status || 'сеть'}).`;
    }

    apply(form: FormGroup, error: unknown): void {
        if (!(error instanceof HttpErrorResponse)) return;
        const problem = error.error as DynamicApiProblem | undefined;
        for (const item of problem?.errors ?? []) {
            const parts = item.field.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
            // Пробуем все суффиксы: метод DTO может присутствовать в пути Jakarta Validation.
            let control = null as ReturnType<FormGroup['get']>;
            for (let start = 0; start < parts.length; start++) {
                control = form.get(parts.slice(start).join('.'));
                if (control) break;
            }
            if (!control) continue;
            control.setErrors({ ...control.errors, server: item.message });
            control.markAsTouched();
        }
    }
}
