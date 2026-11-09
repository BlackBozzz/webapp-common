import { ChangeDetectionStrategy, Component, ContentChild, ContentChildren, EventEmitter, Input, Output, QueryList, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { InputText } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    ArgentTableExportFormat, ArgentTableExportRequest, ArgentTableExportScope,
    ArgentTableFilterOption, ArgentTableFilterValue, ArgentTableQuery,
} from '../../dto/argent-table.dto';
import { ArgentTableExportService } from '../../service/argent-table-export.service';
import { ArgentTableFormatService } from '../../service/argent-table-format.service';
import { ArgentTableToolbarEndDirective, ArgentTableToolbarStartDirective } from '../../directive/argent-table-toolbar.directive';
import { ArgentTableColumnComponent } from '../argent-table-column/argent-table-column.component';
import { ArgentTableCellComponent } from '../argent-table-cell/argent-table-cell.component';
import { ArgentTableBinaryPreviewComponent } from '../argent-table-binary-preview/argent-table-binary-preview.component';
import { ArgentTableEmptyStateComponent } from '../argent-table-empty-state/argent-table-empty-state.component';
import { ArgentTableToolbarComponent } from '../argent-table-toolbar/argent-table-toolbar.component';

/** Универсальная таблица; данные/права/API остаются у страницы-владельца. */
@Component({
    selector: 'argent-table', standalone: true,
    imports: [FormsModule, Select, TableModule, InputText, ArgentTableCellComponent, ArgentTableBinaryPreviewComponent, ArgentTableToolbarComponent, ArgentTableEmptyStateComponent],
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
    private readonly filterOptionsCache = new WeakMap<ArgentTableColumnComponent, {
        source?: readonly ArgentTableFilterOption[];
        labels?: Readonly<Record<string, string>>;
        values: ArgentTableFilterOption[];
    }>();

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
                const column = this.visibleColumns.find(item => item.field === field);
                if (!column) return true;
                const cell = this.formatter.value(row, field);
                if (column.type === 'file') {
                    const exists = cell !== null && cell !== undefined && cell !== '';
                    return exists === (value === true || value === 'true');
                }
                if (column.type === 'boolean') {
                    return cell === (value === true || value === 'true');
                }
                if (column.type === 'enum' || column.type === 'status' || column.type === 'badge') {
                    return String(cell ?? '') === String(value);
                }
                if (['number', 'decimal', 'currency'].includes(column.type)) {
                    return String(cell ?? '') === String(value);
                }
                return this.formatter.text(cell, column.definition).toLocaleLowerCase()
                    .includes(String(value).toLocaleLowerCase());
            });
            return queryMatch && filterMatch;
        });
    }

    /**
     * Ограничиваем реальную ширину таблицы суммой разумных минимальных ширин,
     * а не длиной неразрывного текста, UUID или содержимого чипсов.
     */
    get tableMinWidth(): string {
        const pixels = this.visibleColumns.reduce((sum, column) => {
            const explicit = column.minWidth || column.width;
            if (explicit) {
                const match = /^(\d+(?:\.\d+)?)(px|rem)$/i.exec(explicit.trim());
                if (match) return sum + Number(match[1]) * (match[2].toLowerCase() === 'rem' ? 16 : 1);
            }
            return sum + (column.type === 'actions' ? 200 : 132);
        }, 0);
        return `${Math.ceil(pixels)}px`;
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

    readonly booleanFilterOptions = [
        { label: 'Да', value: true },
        { label: 'Нет', value: false },
    ];
    readonly fileFilterOptions: ArgentTableFilterOption[] = [
        { label: 'Есть файл', value: true },
        { label: 'Нет файла', value: false },
    ];

    exportLoading = false;
    exportError = '';
    binaryDialogVisible = false;
    binaryPreviewValue: unknown = null;

    constructor() {
        this.searchChanges.pipe(debounceTime(350), takeUntilDestroyed()).subscribe(() =>
            this.queryChange.emit({ ...this.query, page: 0 }));
    }

    changeSearch(event: Event): void {
        this.search = (event.target as HTMLInputElement).value;
        this.searchChanges.next();
    }

    /** Согласует строки из серверного API и булевы значения селектов. */
    booleanFilterValue(value: ArgentTableFilterValue | undefined): boolean | null {
        if (value === true || value === 'true') return true;
        if (value === false || value === 'false') return false;
        return null;
    }

    /** Универсальное изменение фильтра с нормализацией очищенного значения. */
    changeTypedFilter(column: ArgentTableColumnComponent, value: string | number | boolean | null): void {
        const filters = { ...this.filters };
        if (value === null || value === '') {
            delete filters[column.field];
        } else {
            filters[column.field] = this.toApiFilterValue(column, value);
        }
        this.filters = filters;
        this.queryChange.emit({ ...this.query, page: 0 });
    }

    /** Фильтры с вводом текста отправляем с debounce. */
    changeInputFilter(column: ArgentTableColumnComponent, event: Event): void {
        const value = (event.target as HTMLInputElement).value.trim();
        const filters = { ...this.filters };
        if (value) filters[column.field] = this.toApiFilterValue(column, value);
        else delete filters[column.field];
        this.filters = filters;
        this.searchChanges.next();
    }

    filterOptionsFor(column: ArgentTableColumnComponent): ArgentTableFilterOption[] {
        const previous = this.filterOptionsCache.get(column);
        if (previous && previous.source === column.filterOptions && previous.labels === column.labelMap) {
            return previous.values;
        }
        const values = column.filterOptions?.length
            ? [...column.filterOptions]
            : Object.entries(column.labelMap ?? {}).map(([value, label]) => ({ value, label }));
        this.filterOptionsCache.set(column, {
            source: column.filterOptions,
            labels: column.labelMap,
            values,
        });
        return values;
    }

    /** Date/time вводим в ISO, числовые поля сохраняем строкой без потери точности. */
    filterInputType(column: ArgentTableColumnComponent): string {
        const type = column.filterType || column.type;
        if (type === 'date' || type === 'time') return type;
        if (['datetime', 'instant', 'offsetdatetime', 'zoneddatetime'].includes(type)) return 'datetime-local';
        return 'text';
    }

    filterInputValue(column: ArgentTableColumnComponent): string {
        const raw = this.filters[column.field];
        if (raw === null || raw === undefined || typeof raw === 'boolean' || Array.isArray(raw)) return '';
        const value = String(raw);
        if (this.filterInputType(column) !== 'datetime-local' || !value) return value;
        const type = column.filterType || column.type;
        if (!['instant', 'offsetdatetime', 'zoneddatetime'].includes(type)) return value.substring(0, 19);
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const pad = (part: number) => String(part).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
            + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    filterPlaceholder(column: ArgentTableColumnComponent): string {
        const type = column.filterType || column.type;
        if (type === 'uuid') return 'UUID: 8-4-4-4-12';
        if (['number', 'integer', 'decimal', 'currency'].includes(type)) return 'Точное число';
        return 'Точное значение';
    }

    /** LocalDateTime оставляем локальным, Instant/OffsetDateTime переводим в ISO UTC. */
    private toApiFilterValue(column: ArgentTableColumnComponent, value: string | number | boolean): string | number | boolean {
        const type = column.filterType || column.type;
        if (typeof value === 'string' && value && ['instant', 'offsetdatetime', 'zoneddatetime'].includes(type)) {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
        }
        return value;
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

    openBinaryPreview(value: unknown): void {
        this.binaryPreviewValue = value;
        this.binaryDialogVisible = true;
    }

    closeBinaryPreview(visible: boolean): void {
        this.binaryDialogVisible = visible;
        if (!visible) this.binaryPreviewValue = null;
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
