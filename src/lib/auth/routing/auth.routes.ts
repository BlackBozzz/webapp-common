import { Routes } from '@angular/router';

/** Маршруты аутентификации: страница входа (подключается хостом рядом с `ARGENT_ROUTES`). */
export const ARGENT_AUTH_ROUTES: Routes = [
    {
        path: 'login',
        title: 'Вход',
        loadComponent: () => import('../pages/login/login.page').then(m => m.LoginPage),
    },
];
