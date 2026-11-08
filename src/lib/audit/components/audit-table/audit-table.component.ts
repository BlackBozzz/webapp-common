import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
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
    imports: [DatePipe, TableModule],
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

    protected paginate(event: TableLazyLoadEvent): void {
        const size = event.rows || this.pageSize();
        this.lazyLoad.emit({ page: Math.floor((event.first || 0) / size), size });
    }
}
