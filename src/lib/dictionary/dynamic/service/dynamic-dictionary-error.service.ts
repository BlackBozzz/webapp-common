import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { applyServerErrors, problemMessage } from '../../../errors/problem-detail';

/**
 * Привязывает сообщения Spring ProblemDetail к полям реактивной формы.
 * Тонкая обёртка над модулем ошибок (`problemMessage`, `applyServerErrors`).
 */
@Injectable({ providedIn: 'root' })
export class DynamicDictionaryErrorService {
    message(error: unknown): string {
        return problemMessage(error, 'Не удалось выполнить операцию.');
    }

    apply(form: FormGroup, error: unknown): void {
        applyServerErrors(form, error);
    }
}
