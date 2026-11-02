import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ADMIN_NAVIGATION } from '../../config/admin-navigation.config';
import { AdminSectionCardComponent } from '../../components/admin-section-card/admin-section-card.component';

/** Стартовая страница административной панели. */
@Component({
    selector: 'argent-admin-dashboard',
    standalone: true,
    imports: [AdminSectionCardComponent],
    templateUrl: './admin-dashboard.component.html',
    styleUrl: './admin-dashboard.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent {
    readonly sections = ADMIN_NAVIGATION.filter(item => item.id !== 'dashboard');
}
