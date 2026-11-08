import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthStore } from '../../../auth/service/auth.store';
import { ADMIN_NAVIGATION } from '../../config/admin-navigation.config';
import { isNavigationItemVisible } from '../../config/admin-navigation.visibility';
import { AdminSectionCardComponent } from '../../components/admin-section-card/admin-section-card.component';

/** Стартовая страница административной панели: карточки доступных пользователю разделов. */
@Component({
    selector: 'argent-admin-dashboard',
    standalone: true,
    imports: [AdminSectionCardComponent],
    templateUrl: './admin-dashboard.component.html',
    styleUrl: './admin-dashboard.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent {
    private readonly store = inject(AuthStore);

    readonly sections = computed(() =>
        ADMIN_NAVIGATION.filter(item => item.id !== 'dashboard' && isNavigationItemVisible(item, this.store)),
    );
}
