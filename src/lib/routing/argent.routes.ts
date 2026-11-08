import { Routes } from '@angular/router';
import { authGuard } from '../auth/guard/auth.guard';

/** Все маршруты Argent, доступные приложению-хосту. Админка — только для вошедших. */
export const ARGENT_ROUTES: Routes = [
    {
        path: 'admin',
        canActivate: [authGuard],
        loadChildren: () => import('../admin/routing/admin.routes')
            .then(m => m.ARGENT_ADMIN_ROUTES),
    },
];
