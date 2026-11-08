import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
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
import { DynamicDictionarySchema, DynamicPage, DynamicRecordsQuery } from '../../dto/dynamic-dictionary.dto';
import { DictionaryRecord } from '../../service/dynamic-dictionary-form.service';
import { DynamicDictionaryApiService } from '../../service/dynamic-dictionary-api.service';
import { DynamicDictionaryErrorService } from '../../service/dynamic-dictionary-error.service';
import { DictionaryRecordDialogComponent } from '../../components/dialog/dictionary-record-dialog/dictionary-record-dialog.component';
import { DictionaryRecordTableComponent } from '../../components/table/dictionary-record-table/dictionary-record-table.component';

/** Универсальная страница справочника: серверные данные и операции над выбранной строкой. */
@Component({
    selector: 'argent-dictionary-records-page',
    standalone: true,
    imports: [
        RouterLink, ButtonDirective, InputTextModule, ConfirmDialogModule, ToastModule,
        DictionaryRecordTableComponent, DictionaryRecordDialogComponent,
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
    private readonly confirm = inject(ConfirmationService);
    private readonly messages = inject(MessageService);
    private readonly auth = inject(AuthStore);
    private readonly destroyRef = inject(DestroyRef);
    private readonly filtersChanged = new Subject<void>();
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
    /** Можно ли изменять записи: грант `write` на справочник (только для UI, права проверяет backend). */
    readonly canWrite = computed(() => {
        // Явно читаем пользователя, чтобы кнопки появлялись после загрузки грантов.
        this.auth.user();
        return this.auth.canTable(this.code(), 'write');
    });

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
                this.messages.add({ severity: 'error', summary: 'Удаление не выполнено', detail: this.errors.message(error) });
            },
        });
    }
}
