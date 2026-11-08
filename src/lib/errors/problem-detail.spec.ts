import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { applyServerErrors, problemMessage } from './problem-detail';

describe('problem-detail', () => {
    it('problemMessage returns detail', () => {
        const error = new HttpErrorResponse({
            status: 409,
            error: { title: 'Conflict', status: 409, detail: 'Запись уже существует' },
        });

        expect(problemMessage(error, 'Ошибка')).toBe('Запись уже существует');
    });

    it('problemMessage returns "Сервер недоступен" for status 0', () => {
        const error = new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') });

        expect(problemMessage(error, 'Ошибка')).toBe('Сервер недоступен');
    });

    it('applyServerErrors sets server error on nested control and returns true', () => {
        const form = new FormGroup({
            address: new FormGroup({ city: new FormControl('') }),
        });
        const error = new HttpErrorResponse({
            status: 400,
            error: {
                title: 'Bad Request',
                status: 400,
                detail: 'Ошибка валидации',
                errors: [{ field: 'create.request.address.city', message: 'Город обязателен' }],
            },
        });

        const applied = applyServerErrors(form, error);

        const city = form.get('address.city')!;
        expect(applied).toBe(true);
        expect(city.errors).toEqual({ server: 'Город обязателен' });
        expect(city.touched).toBe(true);
    });

    it('applyServerErrors returns false when no field matches', () => {
        const form = new FormGroup({ name: new FormControl('') });
        const error = new HttpErrorResponse({
            status: 400,
            error: {
                title: 'Bad Request',
                status: 400,
                errors: [{ field: 'items[0].email', message: 'Неизвестное поле' }],
            },
        });

        expect(applyServerErrors(form, error)).toBe(false);
        expect(form.get('name')!.errors).toBeNull();
    });
});
