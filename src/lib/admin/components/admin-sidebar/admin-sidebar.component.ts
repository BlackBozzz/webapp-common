import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ADMIN_NAVIGATION } from '../../config/admin-navigation.config';
import { AdminNavItemComponent } from '../admin-nav-item/admin-nav-item.component';

/** Вертикальная навигация администратора. */
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

    readonly navigation = ADMIN_NAVIGATION;
}
