import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { problemMessage } from '../../errors/problem-detail';
import { ARGENT_AUTH_CONFIG } from '../config/auth.config';
import { AuthStore } from '../service/auth.store';

/**
 * Общая реакция на ошибки доступа:
 * - 401 (кроме самого входа) — сессия истекла: забываем токен и уводим на страницу входа
 *   с `returnUrl` (если пользователь уже на ней — только забываем токен);
 * - 403 — toast «Недостаточно прав» в `p-toast` с ключом `argent`.
 * Ошибка всегда пробрасывается дальше, чтобы вызывающий код мог её обработать.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
    const config = inject(ARGENT_AUTH_CONFIG);
    const store = inject(AuthStore);
    const router = inject(Router);
    const messages = inject(MessageService);

    return next(request).pipe(
        catchError((error: unknown) => {
            if (error instanceof HttpErrorResponse) {
                if (error.status === 401 && !isLoginRequest(request.url, config.apiBaseUrl)) {
                    store.clear();
                    // Уже на странице входа (например, упал запрос пользователя после входа) — не уходим с неё.
                    if (!router.url.startsWith(config.loginPath)) {
                        void router.navigateByUrl(
                            `${config.loginPath}?returnUrl=${encodeURIComponent(router.url)}`,
                        );
                    }
                } else if (error.status === 403) {
                    messages.add({
                        key: 'argent',
                        severity: 'warn',
                        summary: 'Недостаточно прав',
                        detail: problemMessage(error, ''),
                    });
                }
            }
            return throwError(() => error);
        }),
    );
};

/** Запрос входа: его 401 означает неверные учётные данные, а не истёкшую сессию. */
function isLoginRequest(url: string, apiBaseUrl: string): boolean {
    const path = url.split('?')[0];
    return path.endsWith(`${apiBaseUrl}/login`);
}
