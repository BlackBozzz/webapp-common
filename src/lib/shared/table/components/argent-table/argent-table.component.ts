import {
    AfterContentInit, ChangeDetectionStrategy, Component, ContentChild, ContentChildren,
    DestroyRef, EventEmitter, Input, OnChanges, OnDestroy, Output, QueryList, SimpleChanges, inject,
} from '@angular/core';
import { InputText } from 'primeng/inputtext';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AgGridAngular } from 'ag-grid-angular';
import {
    AllCommunityModule, ColDef, GetRowIdParams, GridApi, GridReadyEvent,
    ICellRendererParams, IDatasource, IGetRowsParams, ModuleRegistry, RowDoubleClickedEvent,
    SelectionChangedEvent, SortChangedEvent, themeQuartz,
} from 'ag-grid-community';
import {
    ArgentTableExportFormat, ArgentTableExportRequest, ArgentTableExportScope,
    ArgentTableFilterOption, ArgentTableFilterValue, ArgentTableQuery, ArgentTableColumnDefinition,
} from '../../dto/argent-table.dto';
import { ArgentTableExportService } from '../../service/argent-table-export.service';
import { ArgentTableFormatService } from '../../service/argent-table-format.service';
import {
    ArgentTableToolbarEndDirective, ArgentTableToolbarStartDirective,
} from '../../directive/argent-table-toolbar.directive';
import { ArgentTableColumnComponent } from '../argent-table-column/argent-table-column.component';
import { ArgentTableAgCellComponent } from '../argent-table-ag-cell/argent-table-ag-cell.component';
import { ArgentTableAgHeaderComponent } from '../argent-table-ag-header/argent-table-ag-header.component';
import { ArgentTableBinaryPreviewComponent } from '../argent-table-binary-preview/argent-table-binary-preview.component';
import { ArgentTableToolbarComponent } from '../argent-table-toolbar/argent-table-toolbar.component';

/** Регистрация бесплатных модулей AG Grid выполняется единожды при загрузке таблицы. */
ModuleRegistry.registerModules([AllCommunityModule]);

interface PendingBlock {
    params: IGetRowsParams;
    page: number;
    previousRows: unknown[];
    generation: number;
    sawLoading: boolean;
}

/**
 * Единая таблица с виртуализацией строк и колонок.
 * При lazy=true AG Grid запрашивает данные блоками через существующий queryChange.
 */
@Component({
    selector: 'argent-table',
    standalone: true,
    imports: [
        AgGridAngular, InputText,
        ArgentTableToolbarComponent, ArgentTableBinaryPreviewComponent,
    ],
    templateUrl: './argent-table.component.html',
    styleUrl: './argent-table.component.scss',
    changeDetection: ChangeDetectionStrategy.Default,
})
export class ArgentTableComponent implements AfterContentInit, OnChanges, OnDestroy {
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
    @Input() exportMode: 'page' | 'external' = 'page';
    @Input() exportScope: ArgentTableExportScope = 'page';
    @Input() emptyMessage = 'Нет данных';
    /** Высота области строк не зависит от числа записей. */
    @Input() height = '540px';

    @Output() queryChange = new EventEmitter<ArgentTableQuery>();
    @Output() selectionChange = new EventEmitter<unknown>();
    @Output() refreshRequested = new EventEmitter<void>();
    @Output() exportRequested = new EventEmitter<ArgentTableExportRequest>();
    @Output() importRequested = new EventEmitter<void>();
    @Output() rowDoubleClick = new EventEmitter<unknown>();

    @ContentChildren(ArgentTableColumnComponent) columns?: QueryList<ArgentTableColumnComponent>;
    @ContentChild(ArgentTableToolbarStartDirective) toolbarStart?: ArgentTableToolbarStartDirective;
    @ContentChild(ArgentTableToolbarEndDirective) toolbarEnd?: ArgentTableToolbarEndDirective;

    private readonly destroyRef = inject(DestroyRef);
    private readonly formatter = inject(ArgentTableFormatService);
    private readonly exporter = inject(ArgentTableExportService);
    private readonly searchChanges = new Subject<void>();
    private readonly filterOptionsCache = new WeakMap<ArgentTableColumnComponent, {
        source?: readonly ArgentTableFilterOption[];
        labels?: Readonly<Record<string, string>>;
        values: ArgentTableFilterOption[];
    }>();
    private api?: GridApi;
    private pendingBlock?: PendingBlock;
    private datasourceGeneration = 0;
    private syncingSelection = false;
    private lastAppliedQueryKey = '';
    private cachedSource?: unknown[];
    private cachedQuery = '';
    private cachedRows: unknown[] = [];

    get visibleColumns(): ArgentTableColumnComponent[] {
        return this.columns?.toArray().filter(column => column.visible) ?? [];
    }

    get displayedRows(): unknown[] {
        if (this.lazy) return this.rows;
        const key = JSON.stringify({
            search: this.search, filters: this.filters,
            columns: this.visibleColumns.map(column => [column.field, column.type]),
        });
        if (this.cachedSource === this.rows && this.cachedQuery === key) return this.cachedRows;
        const search = this.search.toLocaleLowerCase();
        this.cachedRows = this.rows.filter(row => {
            const queryMatch = !search || this.visibleColumns.some(column =>
                this.formatter.text(this.formatter.value(row, column.field), column.definition)
                    .toLocaleLowerCase().includes(search));
            const filterMatch = Object.entries(this.filters).every(([field, value]) => {
                if (value === null || value === '' || value === undefined) return true;
                const column = this.visibleColumns.find(item => item.field === field);
                if (!column) return true;
                const cell = this.formatter.value(row, field);
                if (column.type === 'file') {
                    return (cell !== null && cell !== undefined && cell !== '') === (value === true || value === 'true');
                }
                if (column.type === 'boolean') return cell === (value === true || value === 'true');
                if (['enum', 'status', 'badge', 'number', 'decimal', 'currency'].includes(column.type)) {
                    return String(cell ?? '') === String(value);
                }
                return this.formatter.text(cell, column.definition).toLocaleLowerCase()
                    .includes(String(value).toLocaleLowerCase());
            });
            return queryMatch && filterMatch;
        });
        this.cachedSource = this.rows;
        this.cachedQuery = key;
        return this.cachedRows;
    }

    get hasFilters(): boolean {
        return this.visibleColumns.some(column => column.filterable);
    }

    get recordCount(): number {
        return this.lazy ? this.totalRecords : this.displayedRows.length;
    }

    get query(): ArgentTableQuery {
        return {
            page: this.pageIndex,
            size: this.pageSize,
            search: this.search,
            sort: this.sort,
            filters: { ...this.filters },
        };
    }

    get rowSelectionConfig(): { mode: 'singleRow' | 'multiRow'; checkboxes: false; enableClickSelection: true } | undefined {
        if (this.selectionMode === 'none') return undefined;
        return this.selectionMode === 'multiple'
            ? this.multipleRowSelectionConfig : this.singleRowSelectionConfig;
    }

    readonly singleRowSelectionConfig = { mode: 'singleRow', checkboxes: false, enableClickSelection: true } as const;
    readonly multipleRowSelectionConfig = { mode: 'multiRow', checkboxes: false, enableClickSelection: true } as const;

    readonly gridTheme = themeQuartz.withParams({
        accentColor: '#1694a9',
        backgroundColor: '#ffffff',
        foregroundColor: '#162033',
        borderColor: '#e6ebf2',
        headerBackgroundColor: '#fbfcfe',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 13,
        spacing: 8,
    });
    readonly booleanFilterOptions: ArgentTableFilterOption[] = [
        { label: 'Да', value: true },
        { label: 'Нет', value: false },
    ];
    readonly fileFilterOptions: ArgentTableFilterOption[] = [
        { label: 'Есть файл', value: true },
        { label: 'Нет файла', value: false },
    ];
    readonly gridDefaultColumn: ColDef = {
        sortable: false,
        resizable: true,
        suppressMovable: true,
        filter: false,
    };
    gridLocale = {
        noRowsToShow: 'Нет данных',
        loadingOoo: 'Загрузка данных…',
        page: 'Страница',
        of: 'из',
    };

    gridColumns: ColDef[] = [];
    exportLoading = false;
    exportError = '';
    binaryDialogVisible = false;
    binaryPreviewValue: unknown = null;

    getRowId = (params: GetRowIdParams): string =>
        String((params.data as Record<string, unknown>)[this.rowKey] ?? '');

    constructor() {
        this.searchChanges.pipe(debounceTime(350), takeUntilDestroyed()).subscribe(() => {
            if (this.lazy) this.reloadInfiniteRows();
        });
    }

    ngAfterContentInit(): void {
        this.rebuildColumns();
        this.columns?.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.rebuildColumns());
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['showFilters'] && !changes['showFilters'].firstChange) this.rebuildColumns();
        if (this.lazy) {
            if (changes['rows'] || changes['pageIndex'] || changes['loading'] || changes['totalRecords']) {
                this.resolvePendingBlock();
            }
            if (this.api && changes['pageSize'] && !changes['pageSize'].firstChange) {
                this.api.setGridOption('cacheBlockSize', Math.max(1, this.pageSize));
                this.reloadInfiniteRows();
            }
        } else if (this.api && changes['selected']) {
            this.restoreSelection();
        }
        if (changes['emptyMessage']) {
            this.gridLocale = { ...this.gridLocale, noRowsToShow: this.emptyMessage };
        }
        if (this.api && (changes['search'] || changes['filters'] || changes['sort']) && this.lazy) {
            const nextKey = this.queryKey();
            if (nextKey !== this.lastAppliedQueryKey) this.reloadInfiniteRows();
        }
    }

    ngOnDestroy(): void {
        this.pendingBlock?.params.failCallback();
        this.pendingBlock = undefined;
        this.api = undefined;
    }

    onGridReady(event: GridReadyEvent): void {
        this.api = event.api;
        this.lastAppliedQueryKey = this.queryKey();
        if (this.lazy) this.installDatasource();
        else this.restoreSelection();
    }

    onGridSortChanged(event: SortChangedEvent): void {
        const ordered = event.api.getColumnState().find(column => column.sort === 'asc' || column.sort === 'desc');
        this.sort = ordered?.sort ? { field: ordered.colId, direction: ordered.sort } : null;
        this.lastAppliedQueryKey = this.queryKey();
        if (!this.lazy) return;
        // При сортировке AG Grid самостоятельно инвалидирует кеш Infinite Row Model.
    }

    onGridSelectionChanged(event: SelectionChangedEvent): void {
        if (this.syncingSelection) return;
        const rows = event.api.getSelectedRows();
        this.selectionChange.emit(this.selectionMode === 'multiple' ? rows : rows[0] ?? null);
    }

    onGridRowDoubleClicked(event: RowDoubleClickedEvent): void {
        if (event.data) this.rowDoubleClick.emit(event.data);
    }

    changeSearch(event: Event): void {
        this.search = (event.target as HTMLInputElement).value;
        this.searchChanges.next();
    }

    booleanFilterValue(value: ArgentTableFilterValue | undefined): boolean | null {
        if (value === true || value === 'true') return true;
        if (value === false || value === 'false') return false;
        return null;
    }

    changeTypedFilter(column: ArgentTableColumnComponent, value: string | number | boolean | null): void {
        const filters = { ...this.filters };
        if (value === null || value === '') delete filters[column.field];
        else filters[column.field] = this.toApiFilterValue(column, value);
        this.filters = filters;
        if (this.lazy) this.reloadInfiniteRows();
    }

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
        this.filterOptionsCache.set(column, { source: column.filterOptions, labels: column.labelMap, values });
        return values;
    }

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

    openBinaryPreview(value: unknown): void {
        this.binaryPreviewValue = value;
        this.binaryDialogVisible = true;
    }

    closeBinaryPreview(visible: boolean): void {
        this.binaryDialogVisible = visible;
        if (!visible) this.binaryPreviewValue = null;
    }

    /** Перечитать строки из backend (включая уже закэшированные AG Grid).
     * При изменении серверной сортировки очищается весь Infinite Row Model cache.
     */
    refreshRows(): void {
        if (this.lazy) this.reloadInfiniteRows();
        else this.cachedSource = undefined;
    }

    requestRefresh(): void {
        this.refreshRequested.emit();
        if (this.lazy) this.api?.refreshInfiniteCache();
    }

    requestExport(format: ArgentTableExportFormat): void {
        const request: ArgentTableExportRequest = {
            format,
            scope: this.exportMode === 'page' ? (this.lazy ? 'page' : 'filtered') : this.exportScope,
            query: this.query,
            columns: this.visibleColumns.filter(column => column.type !== 'actions').map(column => column.field),
        };
        this.exportRequested.emit(request);
        if (this.exportMode === 'external' || this.exportLoading) return;
        this.exportLoading = true;
        this.exportError = '';
        const columns = this.visibleColumns.filter(column => column.type !== 'actions')
            .map(column => column.definition);
        this.exporter.exportPage(this.title, columns, this.lazy ? this.rows : this.displayedRows, format).subscribe({
            next: response => {
                this.exporter.download(response, this.title || 'Таблица', format);
                this.exportLoading = false;
            },
            error: () => {
                this.exportLoading = false;
                this.exportError = 'Не удалось экспортировать текущие записи.';
            },
        });
    }

    private rebuildColumns(): void {
        this.gridColumns = this.visibleColumns.map(column => {
            const definition = column.definition;
            const width = this.parseWidth(column.width);
            const minWidth = Math.max(
                this.parseWidth(column.minWidth) ?? 110,
                this.showFilters && column.filterable ? 150 : 110,
            );
            return {
                colId: column.field,
                headerName: column.header || column.field,
                field: column.field,
                width,
                minWidth,
                flex: width ? undefined : 1,
                sortable: column.sortable,
                pinned: column.frozen ? 'left' : undefined,
                suppressSizeToFit: Boolean(width),
                cellStyle: { textAlign: column.align },
                headerComponent: ArgentTableAgHeaderComponent,
                headerComponentParams: {
                    argentSortable: column.sortable,
                    argentShowFilterRow: this.showFilters && this.hasFilters,
                    argentShowFilter: this.showFilters && column.filterable,
                    argentOptions: column.type === 'boolean' ? this.booleanFilterOptions
                        : column.type === 'file' ? this.fileFilterOptions : this.filterOptionsFor(column),
                    argentFilterInputType: this.filterInputType(column),
                    argentFilterPlaceholder: this.filterPlaceholder(column),
                    argentFilterInputValue: () => this.filterInputValue(column),
                    argentFilterValue: () => column.type === 'boolean' || column.type === 'file'
                        ? this.booleanFilterValue(this.filters[column.field]) : this.filters[column.field] ?? null,
                    argentFilterChanged: (value: string | number | boolean | null) => this.changeTypedFilter(column, value),
                    argentFilterInput: (event: Event) => this.changeInputFilter(column, event),
                },
                // Для обычных значений используем нативный renderer AG Grid без Angular-компонентов.
                // Angular нужен только для явно переданного пользовательского ng-template.
                cellDataType: false,
                valueFormatter: params => ['actions', 'custom'].includes(definition.type)
                    ? '' : this.formatter.text(params.value, definition),
                cellRenderer: column.cell?.template
                    ? ArgentTableAgCellComponent
                    : ['status', 'badge', 'relation-list', 'file'].includes(definition.type)
                        ? (params: ICellRendererParams) => this.renderFastCell(params.value, definition)
                        : undefined,
                cellRendererParams: column.cell?.template ? {
                    definition,
                    template: column.cell.template,
                    preview: (value: unknown) => this.openBinaryPreview(value),
                    // Тяжёлые пользовательские шаблоны создаются после завершения прокрутки.
                    deferRender: true,
                } : undefined,
                tooltipValueGetter: (params: { data?: unknown }) => {
                    if (definition.type === 'file') return undefined;
                    const value = this.formatter.value(params.data, definition.field);
                    return this.formatter.text(value, definition);
                },
                sort: this.sort?.field === column.field ? this.sort.direction : undefined,
            } as ColDef;
        });
    }

    /**
     * Лёгкое отображение специальных ячеек без входа в Angular change detection.
     * Используем textContent, чтобы данные из API не интерпретировались как HTML.
     */
    private renderFastCell(value: unknown, column: ArgentTableColumnDefinition): HTMLElement | string {
        if (column.type === 'file') {
            const hasFile = value !== null && value !== undefined
                && (typeof value !== 'string' || value.length > 0)
                && (!Array.isArray(value) || value.length > 0);
            if (!hasFile) return '—';

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'argent-grid-file-button';
            button.title = 'Просмотреть вложение';
            button.setAttribute('aria-label', 'Просмотреть вложение');
            const icon = document.createElement('i');
            icon.className = 'pi pi-eye';
            icon.setAttribute('aria-hidden', 'true');
            button.appendChild(icon);
            button.addEventListener('click', event => {
                event.stopPropagation();
                this.openBinaryPreview(value);
            });
            button.addEventListener('dblclick', event => event.stopPropagation());
            return button;
        }

        if (column.type === 'status' || column.type === 'badge') {
            const status = document.createElement('span');
            const severity = column.severityMap?.[String(value)] ?? 'secondary';
            status.className = `argent-grid-status argent-grid-status--${severity}`;
            status.textContent = this.formatter.text(value, column);
            return status;
        }

        if (column.type === 'relation-list') {
            const container = document.createElement('span');
            container.className = 'argent-grid-relations';
            const items = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
            if (!items.length) return '—';

            const labels = items.map(item => this.formatter.text(item, { ...column, type: 'relation' }));
            container.title = labels.join(', ');
            for (const label of labels.slice(0, 2)) {
                const chip = document.createElement('span');
                chip.className = 'argent-grid-relations__chip';
                chip.textContent = label;
                container.appendChild(chip);
            }
            if (labels.length > 2) {
                const counter = document.createElement('span');
                counter.className = 'argent-grid-relations__more';
                counter.textContent = `+${labels.length - 2}`;
                container.appendChild(counter);
            }
            return container;
        }

        return this.formatter.text(value, column);
    }

    private parseWidth(value?: string): number | undefined {
        if (!value) return undefined;
        const match = /^(\d+(?:\.\d+)?)(px|rem)$/i.exec(value.trim());
        if (!match) return undefined;
        return Math.max(60, Number(match[1]) * (match[2].toLowerCase() === 'rem' ? 16 : 1));
    }

    private installDatasource(): void {
        if (!this.api) return;
        this.datasourceGeneration++;
        this.pendingBlock?.params.failCallback();
        this.pendingBlock = undefined;
        const generation = this.datasourceGeneration;
        const datasource: IDatasource = {
            getRows: params => {
                if (generation !== this.datasourceGeneration) {
                    params.failCallback();
                    return;
                }
                // AG Grid запрашивает блоки ровно по pageSize. Backend возвращает такие же страницы.
                const page = Math.floor(params.startRow / Math.max(1, this.pageSize));
                this.pendingBlock = {
                    params, page, generation,
                    previousRows: this.rows,
                    sawLoading: this.loading,
                };
                const sort = params.sortModel[0];
                if (sort?.colId && (sort.sort === 'asc' || sort.sort === 'desc')) {
                    this.sort = { field: sort.colId, direction: sort.sort };
                }
                this.lastAppliedQueryKey = this.queryKey();
                const query: ArgentTableQuery = {
                    ...this.query,
                    page,
                    size: Math.max(1, this.pageSize),
                };
                this.queryChange.emit(query);
            },
        };
        this.api.setGridOption('datasource', datasource);
    }

    private resolvePendingBlock(): void {
        const pending = this.pendingBlock;
        if (!pending || pending.generation !== this.datasourceGeneration) return;
        if (this.loading) {
            pending.sawLoading = true;
            return;
        }
        if (this.pageIndex !== pending.page) return;
        // Не возвращаем старую страницу, когда HTTP-запрос завершился ошибкой.
        if (this.rows === pending.previousRows) {
            if (pending.sawLoading) {
                pending.params.failCallback();
                this.pendingBlock = undefined;
            }
            return;
        }
        this.pendingBlock = undefined;
        pending.params.successCallback(this.rows, this.totalRecords);
        this.restoreSelection();
    }

    private reloadInfiniteRows(): void {
        if (!this.api || !this.lazy) return;
        this.lastAppliedQueryKey = this.queryKey();
        this.installDatasource();
    }

    private restoreSelection(): void {
        if (!this.api || this.selectionMode === 'none') return;
        const ids = new Set((this.selectionMode === 'multiple' && Array.isArray(this.selected)
            ? this.selected : this.selected ? [this.selected] : []).map(value =>
            String((value as Record<string, unknown>)[this.rowKey] ?? '')));
        this.syncingSelection = true;
        this.api.forEachNode(node => {
            if (!node.data) return;
            const value = String((node.data as Record<string, unknown>)[this.rowKey] ?? '');
            node.setSelected(ids.has(value) && value !== '');
        });
        this.syncingSelection = false;
    }

    private queryKey(): string {
        return JSON.stringify({ search: this.search, filters: this.filters, sort: this.sort });
    }

    private toApiFilterValue(column: ArgentTableColumnComponent, value: string | number | boolean): string | number | boolean {
        const type = column.filterType || column.type;
        if (typeof value === 'string' && value && ['instant', 'offsetdatetime', 'zoneddatetime'].includes(type)) {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
        }
        return value;
    }
}
