
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ArgentTableComponent, ArgentTableColumnComponent, ArgentTableQuery } from '../../../shared/table';
import { DynamicPage } from '../../../dictionary/dynamic/dto/dynamic-dictionary.dto';
import { AUDIT_ACTION_LABELS, AuditAction, AuditEntryDto } from '../../dto/audit.dto';

/** Запрошенная таблицей страница журнала (номер с 0). */
export interface AuditPageRequest {
    page: number;
    size: number;
}

/**
 * Таблица записей журнала с серверной пагинацией. Данные сама не загружает: первую страницу
 * запрашивает владелец (`lazyLoadOnInit=false`, без двойного запроса), следующие — по `lazyLoad`.
 */
@Component({
    selector: 'argent-audit-table',
    standalone: true,
    imports: [ArgentTableComponent, ArgentTableColumnComponent],
    templateUrl: './audit-table.component.html',
    styleUrl: './audit-table.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditTableComponent {
    /** Текущая страница журнала; `null` — ещё не загружена. */
    readonly page = input<DynamicPage<AuditEntryDto> | null>(null);
    readonly loading = input(false);
    /** Размер страницы до первой загрузки. */
    readonly rows = input(20);
    /** Показывать колонки таблицы и записи (для общего журнала). */
    readonly showEntity = input(false);
    /** Пользователь сменил страницу или её размер. */
    readonly lazyLoad = output<AuditPageRequest>();

    protected readonly actionLabels: Readonly<Record<string, string>> = AUDIT_ACTION_LABELS;
    protected readonly rowsPerPageOptions = [10, 20, 50, 100];

    protected actionLabel(action: string): string {
        return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
    }

    protected pageSize(): number {
        return this.page()?.size || this.rows();
    }

    protected first(): number {
        const page = this.page();
        return page ? page.page * page.size : 0;
    }

    protected paginate(event: ArgentTableQuery): void {
        this.lazyLoad.emit({ page: event.page, size: event.size });
    }

    protected refresh(): void {
        this.lazyLoad.emit({ page: this.page()?.page ?? 0, size: this.pageSize() });
    }
}
