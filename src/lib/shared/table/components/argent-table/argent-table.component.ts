import { ChangeDetectionStrategy, Component, ContentChild, ContentChildren, EventEmitter, Input, Output, QueryList, inject } from '@angular/core';
import { InputText } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    ArgentTableExportFormat, ArgentTableExportRequest, ArgentTableExportScope,
    ArgentTableFilterValue, ArgentTableQuery,
} from '../../dto/argent-table.dto';
import { ArgentTableExportService } from '../../service/argent-table-export.service';
import { ArgentTableFormatService } from '../../service/argent-table-format.service';
import { ArgentTableToolbarEndDirective, ArgentTableToolbarStartDirective } from '../../directive/argent-table-toolbar.directive';
import { ArgentTableColumnComponent } from '../argent-table-column/argent-table-column.component';
import { ArgentTableCellComponent } from '../argent-table-cell/argent-table-cell.component';
import { ArgentTableEmptyStateComponent } from '../argent-table-empty-state/argent-table-empty-state.component';
import { ArgentTableToolbarComponent } from '../argent-table-toolbar/argent-table-toolbar.component';

/** Универсальная таблица; данные/права/API остаются у страницы-владельца. */
@Component({
    selector: 'argent-table', standalone: true,
    imports: [TableModule, InputText, ArgentTableCellComponent, ArgentTableToolbarComponent, ArgentTableEmptyStateComponent],
    templateUrl: './argent-table.component.html',
    styleUrl: './argent-table.component.scss',
    changeDetection: ChangeDetectionStrategy.Default,
})
export class ArgentTableComponent {
    @Input() title = '';
    @Input() rows: unknown[] = [];
    @Input() rowKey = 'id';
    @Input() loading = false;
    @Input() lazy = true;
    @Input() pageIndex = 0;
    @Input() pageSize = 20;
    @Input() totalRecords = 0;
    @Input() selected: unknown | null = null;
    @Input() selectionMode: 'none' | 'single' | 'multiple' = 'single';
    @Input() search = '';
    @Input() filters: Readonly<Record<string, ArgentTableFilterValue>> = {};
    @Input() sort: ArgentTableQuery['sort'] = null;
    @Input() showSearch = true;
    @Input() showRefresh = true;
    @Input() showExport = true;
    @Input() showImport = false;
    @Input() showFilters = true;
    @Input() exportDisabled = false;
    @Input() importDisabled = false;
    @Input() exportFormats: readonly ArgentTableExportFormat[] = ['xlsx', 'csv'];
    /** Без специализированного обработчика экспортируется только загруженная страница. */
    @Input() exportMode: 'page' | 'external' = 'page';
    @Input() exportScope: ArgentTableExportScope = 'page';
    @Input() emptyMessage = 'Нет данных';

    @Output() queryChange = new EventEmitter<ArgentTableQuery>();
    @Output() selectionChange = new EventEmitter<unknown>();
    @Output() refreshRequested = new EventEmitter<void>();
    @Output() exportRequested = new EventEmitter<ArgentTableExportRequest>();
    @Output() importRequested = new EventEmitter<void>();
    @Output() rowDoubleClick = new EventEmitter<unknown>();

    @ContentChildren(ArgentTableColumnComponent) columns?: QueryList<ArgentTableColumnComponent>;
    @ContentChild(ArgentTableToolbarStartDirective) toolbarStart?: ArgentTableToolbarStartDirective;
    @ContentChild(ArgentTableToolbarEndDirective) toolbarEnd?: ArgentTableToolbarEndDirective;

    private readonly formatter = inject(ArgentTableFormatService);
    private readonly exporter = inject(ArgentTableExportService);
    private readonly searchChanges = new Subject<void>();

    get visibleColumns(): ArgentTableColumnComponent[] {
        return this.columns?.toArray().filter(column => column.visible) ?? [];
    }

    get displayedRows(): unknown[] {
        if (this.lazy) return this.rows;
        const search = this.search.toLocaleLowerCase();
        return this.rows.filter(row => {
            const queryMatch = !search || this.visibleColumns.some(column =>
                this.formatter.text(this.formatter.value(row, column.field), column.definition)
                    .toLocaleLowerCase().includes(search));
            const filterMatch = Object.entries(this.filters).every(([field, value]) => {
                if (value === null || value === '' || value === undefined) return true;
                const cell = this.formatter.value(row, field);
                return String(cell ?? '').toLocaleLowerCase().includes(String(value).toLocaleLowerCase());
            });
            return queryMatch && filterMatch;
        });
    }

    get hasFilters(): boolean { return this.visibleColumns.some(column => column.filterable); }

    /** Горизонтальный отступ для закреплённых колонок с заданной шириной. */
    frozenOffset(index: number): string {
        const previous = this.visibleColumns.slice(0, index).filter(column => column.frozen);
        const left = previous.reduce((sum, column) => {
            const width = column.width ?? column.minWidth ?? '140px';
            return sum + (width.endsWith('px') ? parseFloat(width) || 140 : 140);
        }, 0);
        return `${left}px`;
    }

    get recordCount(): number { return this.lazy ? this.totalRecords : this.displayedRows.length; }

    get query(): ArgentTableQuery {
        return {
            page: this.pageIndex, size: this.pageSize,
            search: this.search, sort: this.sort, filters: { ...this.filters },
        };
    }

    exportLoading = false;
    exportError = '';

    constructor() {
        this.searchChanges.pipe(debounceTime(350), takeUntilDestroyed()).subscribe(() =>
            this.queryChange.emit({ ...this.query, page: 0 }));
    }

    changeSearch(event: Event): void {
        this.search = (event.target as HTMLInputElement).value;
        this.searchChanges.next();
    }

    changeFilter(field: string, event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.filters = { ...this.filters, [field]: value };
        this.searchChanges.next();
    }

    changePage(event: TableLazyLoadEvent): void {
        const size = event.rows || this.pageSize;
        const sortField = typeof event.sortField === 'string' ? event.sortField : undefined;
        this.queryChange.emit({
            ...this.query, page: Math.floor((event.first || 0) / size), size,
            sort: sortField ? { field: sortField, direction: event.sortOrder === -1 ? 'desc' : 'asc' } : this.sort,
        });
    }

    changeLocalPage(event: { first?: number; rows?: number }): void {
        if (this.lazy) return;
        const size = event.rows || this.pageSize;
        this.queryChange.emit({ ...this.query, page: Math.floor((event.first || 0) / size), size });
    }

    requestExport(format: ArgentTableExportFormat): void {
        const request: ArgentTableExportRequest = {
            format, scope: this.exportMode === 'page' ? (this.lazy ? 'page' : 'filtered') : this.exportScope,
            query: this.query, columns: this.visibleColumns.filter(c => c.type !== 'actions').map(c => c.field),
        };
        this.exportRequested.emit(request);
        if (this.exportMode === 'external' || this.exportLoading) return;
        this.exportLoading = true;
        this.exportError = '';
        const columns = this.visibleColumns.filter(c => c.type !== 'actions').map(c => c.definition);
        this.exporter.exportPage(this.title, columns, this.lazy ? this.rows : this.displayedRows, format).subscribe({
            next: response => {
                this.exporter.download(response, this.title || 'Таблица', format);
                this.exportLoading = false;
            },
            error: () => {
                this.exportLoading = false;
                this.exportError = 'Не удалось экспортировать текущую страницу.';
            },
        });
    }
}
