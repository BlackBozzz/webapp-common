import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ARGENT_AUTH_CONFIG } from '../config/auth.config';
import { AuthStore } from '../service/auth.store';

/** Открытые пути входа, на которые токен не отправляется. */
const OPEN_AUTH_PATHS = ['login', 'register', 'config'];

/**
 * Добавляет `Authorization: Bearer <JWT>` к запросам, если пользователь вошёл.
 *
 * Заголовок добавляется только когда:
 * - URL относительный (`/...`, но не `//...`) или того же origin, что и `window.location.origin`
 *   — иначе токен утёк бы на внешние API;
 * - путь не `${apiBaseUrl}/login`, `/register`, `/config` (без query string) — на открытых путях
 *   входа устаревший токен приводит к 401 от фильтра аутентификации.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
    const token = inject(AuthStore).token();
    const apiBaseUrl = inject(ARGENT_AUTH_CONFIG).apiBaseUrl.replace(/\/+$/, '');
    if (!token || !isOwnUrl(request.url) || isOpenAuthPath(request.url, apiBaseUrl)) {
        return next(request);
    }
    return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

function isOwnUrl(url: string): boolean {
    if (url.startsWith('//')) {
        return false;
    }
    if (url.startsWith('/')) {
        return true;
    }
    try {
        return new URL(url).origin === window.location.origin;
    } catch {
        return false;
    }
}

function isOpenAuthPath(url: string, apiBaseUrl: string): boolean {
    const path = pathOf(url);
    return OPEN_AUTH_PATHS.some((name) => path === `${pathOf(apiBaseUrl)}/${name}`);
}

function pathOf(url: string): string {
    try {
        return new URL(url, window.location.origin).pathname.replace(/\/+$/, '');
    } catch {
        return url.split(/[?#]/)[0];
    }
}
