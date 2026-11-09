import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { debounceTime, distinctUntilChanged, map, Subject, Subscription } from 'rxjs';
import { AuthStore } from '../../../../auth/service/auth.store';
import { problemMessage } from '../../../../errors/problem-detail';
import { downloadBlob } from '../../../../shared/file-download';
import { DictionaryExportFormat } from '../../dto/dictionary-transfer.dto';
import { DictionaryTransferApiService } from '../../service/dictionary-transfer-api.service';
import { DynamicDictionarySchema, DynamicPage, DynamicRecordsQuery } from '../../dto/dynamic-dictionary.dto';
import { DictionaryRecord } from '../../service/dynamic-dictionary-form.service';
import { DynamicDictionaryApiService } from '../../service/dynamic-dictionary-api.service';
import { DynamicDictionaryErrorService } from '../../service/dynamic-dictionary-error.service';
import { DictionaryRecordDialogComponent } from '../../components/dialog/dictionary-record-dialog/dictionary-record-dialog.component';
import { ArgentTableComponent, ArgentTableColumnComponent, ArgentTableToolbarEndDirective, ArgentTableQuery, ArgentTableExportRequest, ArgentTableColumnType } from '../../../../shared/table';
import { DynamicFieldDefinition } from '../../dto/dynamic-dictionary.dto';
import { DictionaryImportDialogComponent } from '../../components/dialog/dictionary-import-dialog/dictionary-import-dialog.component';

/** Универсальная страница справочника: серверные данные и операции над выбранной строкой. */
@Component({
    selector: 'argent-dictionary-records-page',
    standalone: true,
    imports: [
        RouterLink, ButtonDirective, InputTextModule, ConfirmDialogModule, ToastModule,
        ArgentTableComponent, ArgentTableColumnComponent, ArgentTableToolbarEndDirective,
        DictionaryRecordDialogComponent, DictionaryImportDialogComponent,
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './dictionary-records.page.html',
    styleUrl: './dictionary-records.page.scss',
    changeDetection: ChangeDetectionStrategy.Default,
})
export class DictionaryRecordsPage implements OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly api = inject(DynamicDictionaryApiService);
    private readonly errors = inject(DynamicDictionaryErrorService);
    private readonly transfer = inject(DictionaryTransferApiService);
    private readonly confirm = inject(ConfirmationService);
    private readonly messages = inject(MessageService);
    private readonly auth = inject(AuthStore);
    private readonly destroyRef = inject(DestroyRef);
    private readonly filtersChanged = new Subject<void>();
    private readonly enumOptionsCache = new WeakMap<DynamicFieldDefinition, { label: string; value: string }[]>();
    private dataRequest?: Subscription;
    private schemaRequest?: Subscription;

    readonly code = signal('');
    readonly schema = signal<DynamicDictionarySchema | null>(null);
    readonly page = signal<DynamicPage<DictionaryRecord> | null>(null);
    readonly loading = signal(false);
    readonly error = signal('');
    readonly searchText = signal('');
    readonly filters = signal<Record<string, string>>({});
    readonly selected = signal<DictionaryRecord | null>(null);
    readonly dialogVisible = signal(false);
    readonly editingId = signal<string | null>(null);
    readonly deleting = signal(false);
    readonly pageIndex = signal(0);
    readonly pageSize = signal(20);
    readonly sort = signal('');
    readonly title = computed(() => this.schema()?.name || this.code());
    readonly tableColumns = computed(() => [...(this.schema()?.fields ?? [])]
        .filter(field => field.visible && field.control !== 'hidden')
        .sort((left, right) => left.order - right.order));
    readonly sortQuery = computed<ArgentTableQuery['sort']>(() => {
        const [field, direction] = this.sort().split(',');
        return field ? { field, direction: direction === 'desc' ? 'desc' : 'asc' } : null;
    });
    /** Можно ли изменять записи: грант `write` на справочник (только для UI, права проверяет backend). */
    readonly canWrite = computed(() => {
        // Явно читаем пользователя, чтобы кнопки появлялись после загрузки грантов.
        this.auth.user();
        return this.auth.canTable(this.code(), 'write');
    });
    /** Экспорт доступен с грантом `read` на справочник. */
    readonly canRead = computed(() => {
        this.auth.user();
        return this.auth.canTable(this.code(), 'read');
    });
    /** Импорт: действие `import` и грант `write` на справочник. */
    readonly canImport = computed(() => this.canWrite() && this.auth.hasAction('import'));
    readonly exporting = signal(false);
    readonly importVisible = signal(false);

    constructor() {
        this.route.paramMap.pipe(
            map(params => params.get('code') || ''),
            distinctUntilChanged(),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(code => this.loadSchema(code));

        this.filtersChanged.pipe(
            debounceTime(350),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(() => {
            this.pageIndex.set(0);
            this.loadRecords();
        });
    }

    ngOnDestroy(): void {
        this.dataRequest?.unsubscribe();
        this.schemaRequest?.unsubscribe();
    }

    refresh(): void {
        this.selected.set(null);
        this.loadRecords();
    }

    search(event: Event): void {
        this.searchText.set((event.target as HTMLInputElement).value);
        this.filtersChanged.next();
    }

    filter(event: { field: string; value: string }): void {
        this.filters.update(values => ({ ...values, [event.field]: event.value }));
        this.filtersChanged.next();
    }

    paginate(event: TableLazyLoadEvent): void {
        const size = event.rows || this.pageSize();
        this.pageSize.set(size);
        this.pageIndex.set(Math.floor((event.first || 0) / size));
        if (typeof event.sortField === 'string' && event.sortField) {
            this.sort.set(`${event.sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}`);
        } else {
            this.sort.set(`${this.schema()?.idField || 'id'},asc`);
        }
        this.loadRecords();
    }

    /** Преобразует настройки общей таблицы в существующий контракт API справочников. */
    changeQuery(query: ArgentTableQuery): void {
        this.pageIndex.set(query.page);
        this.pageSize.set(query.size);
        this.searchText.set(query.search);
        this.filters.set(Object.fromEntries(Object.entries(query.filters)
            .filter(([, value]) => value !== null && value !== '' && value !== undefined)
            .map(([field, value]) => [field, String(value)])));
        this.sort.set(query.sort ? `${query.sort.field},${query.sort.direction}`
            : `${this.schema()?.idField || 'id'},asc`);
        this.loadRecords();
    }

    changeSelection(value: unknown): void {
        this.selected.set(value as DictionaryRecord | null);
    }

    openRow(value: unknown): void {
        this.changeSelection(value);
        this.edit();
    }

    exportTable(request: ArgentTableExportRequest): void {
        this.exportRecords(request.format);
    }

    columnType(field: DynamicFieldDefinition): ArgentTableColumnType {
        if (field.reference) return field.reference.multiple ? 'relation-list' : 'relation';
        switch (field.type) {
            case 'boolean': return 'boolean';
            case 'date': return 'date';
            case 'time': return 'time';
            case 'datetime': case 'instant': case 'offsetdatetime': case 'zoneddatetime': return 'datetime';
            case 'number': case 'integer': case 'long': case 'short': case 'byte': return 'number';
            case 'decimal': case 'bigdecimal': case 'float': case 'double': return 'decimal';
            case 'uuid': return 'uuid';
            case 'enum': return 'enum';
            case 'binary': case 'bytes': return 'file';
            case 'array': return 'relation-list';
            case 'object': return 'relation';
            default: return field.control === 'textarea' ? 'text' : 'string';
        }
    }

    sortableColumn(field: DynamicFieldDefinition): boolean {
        return !field.reference && !['object', 'array', 'binary', 'bytes'].includes(field.type);
    }

    /** Сервер разрешает только скалярные фильтры DTO, а не связанные коллекции и файлы. */
    filterableColumn(field: DynamicFieldDefinition): boolean {
        return !field.reference && [
            'string', 'boolean', 'enum', 'uuid', 'date', 'time', 'datetime',
            'instant', 'offsetdatetime', 'zoneddatetime',
            'integer', 'number', 'decimal', 'long', 'short', 'byte',
            'float', 'double', 'bigdecimal', 'biginteger',
        ].includes(field.type);
    }

    /** Серверные enum-фильтры отправляют константу, а пользователю показывают label. */
    enumFilterOptions(field: DynamicFieldDefinition): { label: string; value: string }[] {
        if (field.type !== 'enum') return [];
        const previous = this.enumOptionsCache.get(field);
        if (previous) return previous;
        const options = (field.enumValues ?? []).map(value => ({
            value,
            label: field.enumLabels?.[value] ?? value,
        }));
        this.enumOptionsCache.set(field, options);
        return options;
    }

    add(): void {
        this.editingId.set(null);
        this.dialogVisible.set(true);
    }

    edit(): void {
        const idField = this.schema()?.idField;
        const row = this.selected();
        if (!idField || !row || row[idField] === null || row[idField] === undefined) return;
        this.editingId.set(String(row[idField]));
        // Диалог сам выполнит GET свежего DTO при каждом открытии.
        this.dialogVisible.set(true);
    }

    remove(): void {
        const row = this.selected();
        const idField = this.schema()?.idField;
        if (!row || !idField) return;
        const id = row[idField];
        if (id === null || id === undefined) return;
        this.confirm.confirm({
            header: 'Удаление записи',
            message: `Удалить выбранную запись справочника «${this.title()}»?`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Удалить',
            rejectLabel: 'Отмена',
            accept: () => this.deleteRecord(String(id)),
        });
    }

    /** Выгрузка с текущими поиском и сортировкой. */
    exportRecords(format: DictionaryExportFormat): void {
        if (this.exporting()) return;
        this.exporting.set(true);
        const code = this.code();
        const query = { search: this.searchText().trim() || undefined, sort: this.sort() || undefined };
        this.transfer.export(code, format, query).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: response => {
                this.exporting.set(false);
                if (response.body) {
                    downloadBlob(response.body, exportFileName(response, `${code}.${format}`));
                }
            },
            error: (error: unknown) => {
                this.exporting.set(false);
                // На 403 toast «Недостаточно прав» уже показал errorInterceptor.
                if (isForbidden(error)) return;
                void blobErrorToJson(error).then(parsed => this.messages.add({
                    severity: 'error',
                    summary: 'Экспорт не выполнен',
                    detail: problemMessage(parsed, 'Не удалось выгрузить записи'),
                }));
            },
        });
    }

    openImport(): void {
        this.importVisible.set(true);
    }

    onImported(): void {
        this.refresh();
    }

    onSaved(): void {
        this.dialogVisible.set(false);
        this.selected.set(null);
        this.messages.add({ severity: 'success', summary: 'Сохранено', detail: 'Данные справочника обновлены.' });
        this.loadRecords();
    }

    private loadSchema(code: string): void {
        this.schemaRequest?.unsubscribe();
        this.dataRequest?.unsubscribe();
        this.code.set(code);
        this.schema.set(null);
        this.page.set(null);
        this.selected.set(null);
        this.filters.set({});
        this.searchText.set('');
        this.pageIndex.set(0);
        this.dialogVisible.set(false);
        this.importVisible.set(false);
        this.loading.set(true);
        this.error.set('');
        if (!code) return;
        this.schemaRequest = this.api.getSchema(code).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: schema => {
                this.schema.set(schema);
                this.sort.set(`${schema.idField},asc`);
                this.loadRecords();
            },
            error: error => {
                this.loading.set(false);
                this.error.set(this.errors.message(error));
            },
        });
    }

    private loadRecords(): void {
        if (!this.schema()) return;
        this.dataRequest?.unsubscribe();
        this.selected.set(null);
        this.loading.set(true);
        this.error.set('');
        const query: DynamicRecordsQuery = {
            page: this.pageIndex(),
            size: this.pageSize(),
            sort: this.sort(),
            search: this.searchText().trim() || undefined,
            filters: this.filters(),
        };
        this.dataRequest = this.api.getRecords<DictionaryRecord>(this.code(), query)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: page => {
                    this.page.set(page);
                    this.loading.set(false);
                },
                error: error => {
                    this.loading.set(false);
                    this.error.set(this.errors.message(error));
                },
            });
    }

    private deleteRecord(id: string): void {
        this.deleting.set(true);
        this.api.deleteRecord(this.code(), id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: () => {
                this.deleting.set(false);
                this.messages.add({ severity: 'success', summary: 'Удалено', detail: 'Запись удалена.' });
                this.refresh();
            },
            error: error => {
                this.deleting.set(false);
                if (isForbidden(error)) return;
                this.messages.add({ severity: 'error', summary: 'Удаление не выполнено', detail: this.errors.message(error) });
            },
        });
    }
}

/** Имя файла из `Content-Disposition` (`filename*=UTF-8''…` или `filename="…"`), иначе `fallback`. */
function exportFileName(response: HttpResponse<Blob>, fallback: string): string {
    const header = response.headers.get('Content-Disposition') ?? '';
    const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)?.[1];
    if (encoded) {
        try {
            return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ''));
        } catch {
            // Битая кодировка в заголовке — используем запасное имя ниже.
        }
    }
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1]?.trim();
    return plain || fallback;
}

function isForbidden(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 403;
}

/**
 * При `responseType: 'blob'` тело ошибки тоже приходит Blob — разбираем его как JSON ProblemDetail,
 * чтобы показать `detail` с backend. Если не JSON, возвращаем исходную ошибку.
 */
async function blobErrorToJson(error: unknown): Promise<unknown> {
    if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob)) return error;
    try {
        const body: unknown = JSON.parse(await error.error.text());
        return new HttpErrorResponse({
            error: body,
            headers: error.headers,
            status: error.status,
            statusText: error.statusText,
            url: error.url ?? undefined,
        });
    } catch {
        return error;
    }
}
