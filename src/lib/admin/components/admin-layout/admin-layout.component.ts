import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { AdminLayoutStateService } from '../../service/admin-layout-state.service';
import { AdminHeaderComponent } from '../admin-header/admin-header.component';
import { AdminSidebarComponent } from '../admin-sidebar/admin-sidebar.component';

/** Общая оболочка маршрутов /admin. */
@Component({
    selector: 'argent-admin-layout',
    standalone: true,
    imports: [RouterOutlet, ToastModule, AdminHeaderComponent, AdminSidebarComponent],
    providers: [AdminLayoutStateService],
    templateUrl: './admin-layout.component.html',
    styleUrl: './admin-layout.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayoutComponent {
    private readonly state = inject(AdminLayoutStateService);

    get collapsed(): boolean {
        return this.state.collapsed;
    }

    get mobileOpen(): boolean {
        return this.state.mobileOpen;
    }

    toggleCollapsed(): void {
        this.state.toggleCollapsed();
    }

    toggleMobile(): void {
        this.state.toggleMobile();
    }

    closeMobile(): void {
        this.state.closeMobile();
    }
}
