import { Routes } from '@angular/router';
import { actionGuard } from '../../auth/guard/auth.guard';

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
            {
                path: 'users',
                title: 'Пользователи',
                canActivate: [actionGuard('admin')],
                loadComponent: () => import('../pages/admin-users/admin-users.page')
                    .then(m => m.AdminUsersPage),
            },
            {
                path: 'roles',
                title: 'Роли',
                canActivate: [actionGuard('admin')],
                loadComponent: () => import('../pages/admin-roles/admin-roles.page')
                    .then(m => m.AdminRolesPage),
            },
            {
                path: 'audit',
                title: 'Журнал изменений',
                canActivate: [actionGuard('admin')],
                loadComponent: () => import('../pages/admin-audit/admin-audit.page')
                    .then(m => m.AdminAuditPage),
            },
        ],
    },
];
