import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { AbstractControl } from '@angular/forms';
import { Message } from 'primeng/message';
import { startWith, switchMap } from 'rxjs';

/** Ошибки, которые умеет показывать {@link FieldErrorComponent}: встроенные `Validators.*` + `server`. */
interface KnownErrors {
    server?: string;
    required?: true;
    maxlength?: { requiredLength: number };
    minlength?: { requiredLength: number };
    min?: { min: number };
    max?: { max: number };
    email?: true;
}

/**
 * Первая ошибка `control` под полем, когда поле уже тронуто: клиентские валидаторы
 * (`required`, `maxlength`, ...) и `server` из `applyServerErrors`.
 */
@Component({
    selector: 'argent-field-error',
    imports: [Message],
    templateUrl: './field-error.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldErrorComponent {
    readonly control = input.required<AbstractControl>();

    /**
     * Последнее событие контрола (значение, статус, touched). Нужно, чтобы OnPush-компонент
     * перерисовывался при изменении состояния контрола, которое не является сигналом.
     */
    private readonly controlEvent = toSignal(
        toObservable(this.control).pipe(switchMap((control) => control.events.pipe(startWith(null)))),
    );

    /** Текст первой ошибки контрола или `undefined`, если показывать нечего. */
    protected readonly message = computed(() => {
        this.controlEvent();
        const control = this.control();
        const errors = control.errors as KnownErrors | null;
        if (!errors || !control.touched) {
            return undefined;
        }

        if (errors.server) {
            return errors.server;
        }
        if (errors.required) {
            return 'Обязательное поле';
        }
        if (errors.maxlength) {
            return `Не больше ${errors.maxlength.requiredLength} символов`;
        }
        if (errors.minlength) {
            return `Не меньше ${errors.minlength.requiredLength} символов`;
        }
        if (errors.min) {
            return `Не меньше ${errors.min.min}`;
        }
        if (errors.max) {
            return `Не больше ${errors.max.max}`;
        }
        if (errors.email) {
            return 'Некорректный email';
        }
        return 'Некорректное значение';
    });
}
