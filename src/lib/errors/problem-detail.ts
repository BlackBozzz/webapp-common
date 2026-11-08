import { HttpErrorResponse } from '@angular/common/http';
import type { AbstractControl, FormGroup } from '@angular/forms';

/** Ошибка валидации отдельного поля из {@link ProblemDetail.errors}. */
export interface FieldError {
    /** Путь поля DTO, например `address.city` или `items[0].name`. */
    field: string;
    message: string;
}

/**
 * Тело ошибки от backend — RFC 9457 `ProblemDetail`. В этом формате приходят любые ошибки
 * контроллеров, включая 401 и 403.
 */
export interface ProblemDetail {
    type?: string;
    title?: string;
    status?: number;
    /** Человекочитаемое описание ошибки — его и показываем пользователю. */
    detail?: string;
    instance?: string;
    /** Только у ошибок валидации: список ошибок отдельных полей. */
    errors?: FieldError[];
}

/** Достаёт {@link ProblemDetail} из ошибки `HttpClient`, если backend его прислал. */
export function toProblemDetail(error: unknown): ProblemDetail | undefined {
    if (!(error instanceof HttpErrorResponse)) {
        return undefined;
    }
    const body: unknown = error.error;
    return body !== null && typeof body === 'object' ? (body as ProblemDetail) : undefined;
}

/**
 * Текст ошибки для показа пользователю (toast, `p-message`): `detail`, затем `title`
 * из {@link ProblemDetail}, а если их нет — `fallback`.
 *
 * @param error ошибка из error-канала Observable `HttpClient`
 * @param fallback текст, если backend не прислал ни `detail`, ни `title`
 */
export function problemMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && error.status === 0) {
        return 'Сервер недоступен';
    }
    const problem = toProblemDetail(error);
    return problem?.detail || problem?.title || fallback;
}

/**
 * Раскладывает ошибки валидации backend (`errors`) по контролам формы — как ошибку `server`,
 * которую показывает `argent-field-error`. Путь `items[0].name` превращается в `items.0.name`;
 * пробуются все суффиксы пути, т.к. Jakarta Validation может добавить в начало имя метода
 * и параметра (`create.request.address.city`).
 *
 * @param form форма, имена контролов которой совпадают с полями DTO на backend
 * @param error ошибка из error-канала Observable `HttpClient`
 * @returns `true`, если хотя бы одна ошибка легла на поле формы; иначе вызывающему коду
 *   стоит показать общее сообщение через {@link problemMessage}
 */
export function applyServerErrors(form: FormGroup, error: unknown): boolean {
    let applied = false;
    for (const item of toProblemDetail(error)?.errors ?? []) {
        const control = findControl(form, item.field);
        if (!control) {
            continue;
        }
        control.setErrors({ ...control.errors, server: item.message });
        control.markAsTouched();
        applied = true;
    }
    return applied;
}

/** Ищет контрол по пути поля backend, перебирая суффиксы пути от самого длинного. */
function findControl(form: FormGroup, field: string): AbstractControl | null {
    const parts = field.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    for (let start = 0; start < parts.length; start++) {
        const control = form.get(parts.slice(start).join('.'));
        if (control) {
            return control;
        }
    }
    return null;
}
