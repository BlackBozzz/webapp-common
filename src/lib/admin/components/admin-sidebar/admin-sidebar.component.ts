import { ChangeDetectionStrategy, Component, computed, EventEmitter, inject, Input, Output } from '@angular/core';
import { AuthStore } from '../../../auth/service/auth.store';
import { ADMIN_NAVIGATION } from '../../config/admin-navigation.config';
import { isNavigationItemVisible } from '../../config/admin-navigation.visibility';
import { AdminNavItemComponent } from '../admin-nav-item/admin-nav-item.component';

/** Боковая навигация, включая сворачивание и мобильный переключатель. */
@Component({
    selector: 'argent-admin-sidebar',
    standalone: true,
    imports: [AdminNavItemComponent],
    templateUrl: './admin-sidebar.component.html',
    styleUrl: './admin-sidebar.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSidebarComponent {
    @Input() collapsed = false;
    @Input() mobileOpen = false;

    @Output() navigated = new EventEmitter<void>();
    @Output() toggleCollapsed = new EventEmitter<void>();
    @Output() toggleMobile = new EventEmitter<void>();

    private readonly store = inject(AuthStore);

    readonly navigation = computed(() =>
        ADMIN_NAVIGATION.filter(item => isNavigationItemVisible(item, this.store)),
    );
}
