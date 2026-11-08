import { ChangeDetectionStrategy, Component, computed, EventEmitter, inject, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { ARGENT_AUTH_CONFIG } from '../../../auth/config/auth.config';
import { AuthApiService } from '../../../auth/service/auth-api.service';
import { AuthStore } from '../../../auth/service/auth.store';

/** Верхняя панель администратора: переключатели меню, текущий пользователь и выход. */
@Component({
    selector: 'argent-admin-header',
    standalone: true,
    imports: [ButtonDirective],
    templateUrl: './admin-header.component.html',
    styleUrl: './admin-header.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHeaderComponent {
    private readonly api = inject(AuthApiService);
    private readonly store = inject(AuthStore);
    private readonly router = inject(Router);
    private readonly loginPath = inject(ARGENT_AUTH_CONFIG).loginPath;

    @Input() collapsed = false;

    @Output() toggleCollapsed = new EventEmitter<void>();
    @Output() toggleMobile = new EventEmitter<void>();

    /** Имя текущего пользователя (или логин, если имя пустое). */
    protected readonly userName = computed(() => {
        const user = this.store.user();
        return user?.displayName || user?.login || '';
    });

    /** Первая буква имени для аватара. */
    protected readonly initial = computed(() => this.userName().charAt(0).toUpperCase() || '?');

    /** Выход: сообщаем backend (ошибки не важны), забываем сессию и уходим на страницу входа. */
    protected logout(): void {
        const leave = (): void => {
            this.store.clear();
            void this.router.navigateByUrl(this.loginPath);
        };
        this.api.logout().subscribe({ next: leave, error: leave });
    }
}
