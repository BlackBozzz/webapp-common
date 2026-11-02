import { Routes } from '@angular/router';

/** Все маршруты Argent, доступные приложению-хосту. */
export const ARGENT_ROUTES: Routes = [
    {
        path: 'admin',
        loadChildren: () => import('../admin/routing/admin.routes')
            .then(m => m.ARGENT_ADMIN_ROUTES),
    },
];
