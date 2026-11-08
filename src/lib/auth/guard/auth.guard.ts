import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ARGENT_AUTH_CONFIG } from '../config/auth.config';
import { AuthStore } from '../service/auth.store';

/**
 * Пускает только вошедшего пользователя. Без токена — редирект на страницу входа с `returnUrl`.
 * Если токен есть, а пользователь ещё не загружен (перезагрузка страницы), сначала загружает его;
 * при ошибке загрузки — тоже на страницу входа.
 */
export const authGuard: CanActivateFn = (_route, state) => {
    const store = inject(AuthStore);
    const router = inject(Router);
    const loginPath = inject(ARGENT_AUTH_CONFIG).loginPath;
    const toLogin = (): UrlTree =>
        router.createUrlTree([loginPath], { queryParams: { returnUrl: state.url } });

    if (!store.token()) {
        return toLogin();
    }
    if (store.user()) {
        return true;
    }
    return store.loadUser().pipe(
        map(() => true),
        catchError(() => of(toLogin())),
    );
};

/**
 * Пускает только пользователя с действием `code` (или `admin`); иначе — редирект на `/admin`.
 * Ставится после {@link authGuard}: сам пользователя не загружает.
 */
export function actionGuard(code: string): CanActivateFn {
    return () => {
        const store = inject(AuthStore);
        return store.hasAction(code) ? true : inject(Router).createUrlTree(['/admin']);
    };
}
