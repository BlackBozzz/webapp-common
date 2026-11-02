import { Routes } from '@angular/router';

/** Внутренние маршруты административной панели. */
export const ARGENT_ADMIN_ROUTES: Routes = [
    {
        path: '',
        loadComponent: () => import('../components/admin-layout/admin-layout.component')
            .then(m => m.AdminLayoutComponent),
        children: [
            {
                path: '',
                pathMatch: 'full',
                title: 'Панель администратора',
                loadComponent: () => import('../pages/admin-dashboard/admin-dashboard.component')
                    .then(m => m.AdminDashboardComponent),
            },
            {
                path: 'dictionaries',
                loadChildren: () => import('../../dictionary/dynamic/routing/dynamic-dictionary.routes')
                    .then(m => m.ARGENT_DYNAMIC_DICTIONARY_ROUTES),
            },
        ],
    },
];
