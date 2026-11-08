import { HttpErrorResponse } from '@angular/common/http';
import {
    ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked,
} from '@angular/core';
import { MessageService } from 'primeng/api';
import { finalize, Subscription } from 'rxjs';
import { AuthStore } from '../../../auth/service/auth.store';
import { DynamicPage } from '../../../dictionary/dynamic/dto/dynamic-dictionary.dto';
import { problemMessage } from '../../../errors/problem-detail';
import { AuditEntryDto } from '../../dto/audit.dto';
import { AuditApiService } from '../../service/audit-api.service';
import { AuditPageRequest, AuditTableComponent } from '../audit-table/audit-table.component';

const ERROR_FALLBACK = 'Не удалось загрузить историю изменений';

/**
 * История изменений записи `entityType`/`entityId`. Видна при гранте `read` на таблицу
 * или действии `admin` — только для UI, права проверяет backend.
 */
@Component({
    selector: 'argent-audit-log',
    standalone: true,
    imports: [AuditTableComponent],
    templateUrl: './audit-log.component.html',
    styleUrl: './audit-log.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent {
    private readonly api = inject(AuditApiService);
    private readonly auth = inject(AuthStore);
    private readonly messages = inject(MessageService);
    private request?: Subscription;

    /** Таблица записи. */
    readonly entityType = input.required<string>();
    /** Идентификатор записи. */
    readonly entityId = input.required<string>();
    /** Размер первой страницы. */
    readonly pageSize = input(20);

    readonly page = signal<DynamicPage<AuditEntryDto> | null>(null);
    readonly loading = signal(false);
    readonly error = signal('');

    readonly canView = computed(() => {
        // Явно читаем пользователя, чтобы состояние менялось после загрузки грантов.
        this.auth.user();
        return this.auth.canTable(this.entityType(), 'read') || this.auth.hasAction('admin');
    });

    constructor() {
        effect(() => {
            const entityType = this.entityType();
            const entityId = this.entityId();
            const size = this.pageSize();
            const canView = this.canView();
            // untracked: load() пишет сигналы (loading, page) — они не должны стать зависимостями эффекта.
            untracked(() => {
                if (canView) {
                    this.load(entityType, entityId, 0, size);
                } else {
                    this.request?.unsubscribe();
                    this.page.set(null);
                    this.loading.set(false);
                }
            });
        });
        inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
    }

    reload(): void {
        const page = this.page();
        this.onLazyLoad({ page: page?.page ?? 0, size: page?.size ?? this.pageSize() });
    }

    /** Смена страницы или её размера в таблице. */
    onLazyLoad(request: AuditPageRequest): void {
        if (this.canView()) {
            this.load(this.entityType(), this.entityId(), request.page, request.size);
        }
    }

    private load(entityType: string, entityId: string, page: number, size: number): void {
        this.request?.unsubscribe();
        this.loading.set(true);
        this.error.set('');
        this.request = this.api.page({ entityType, entityId, page, size }).pipe(
            finalize(() => this.loading.set(false)),
        ).subscribe({
            next: result => this.page.set(result),
            error: error => {
                this.error.set(problemMessage(error, ERROR_FALLBACK));
                // На 401/403 toast уже показал errorInterceptor.
                if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) return;
                this.messages.add({
                    key: 'argent',
                    severity: 'error',
                    summary: 'История изменений',
                    detail: problemMessage(error, ERROR_FALLBACK),
                });
            },
        });
    }
}
