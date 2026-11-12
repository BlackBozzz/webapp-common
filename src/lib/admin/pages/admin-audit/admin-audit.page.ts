import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonDirective } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Subject, Subscription, auditTime, finalize, timer } from 'rxjs';
import { ArgentAdminLiveService } from '../../service/argent-admin-live.service';
import { AuditPageRequest, AuditTableComponent } from '../../../audit/components/audit-table/audit-table.component';
import { AUDIT_ACTION_LABELS, AUDIT_ACTIONS, AuditEntryDto } from '../../../audit/dto/audit.dto';
import { AuditApiService } from '../../../audit/service/audit-api.service';
import { DynamicDictionarySummary, DynamicPage } from '../../../dictionary/dynamic/dto/dynamic-dictionary.dto';
import { DynamicDictionaryApiService } from '../../../dictionary/dynamic/service/dynamic-dictionary-api.service';
import { problemMessage } from '../../../errors/problem-detail';

/** Вариант выбора в фильтре; пустое значение — «без фильтра». */
interface FilterOption {
    label: string;
    value: string;
}

const PAGE_SIZE = 20;
const ERROR_FALLBACK = 'Не удалось загрузить журнал';

/**
 * Общий журнал изменений для администратора: фильтры по таблице (из списка справочников
 * или вручную), записи, действию и периоду; таблица — та же, что в `<argent-audit-log>`.
 */
@Component({
    selector: 'argent-admin-audit-page',
    standalone: true,
    imports: [DatePipe, FormsModule, ButtonDirective, DatePicker, InputText, Select, AuditTableComponent],
    templateUrl: './admin-audit.page.html',
    styleUrl: './admin-audit.page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAuditPage implements OnInit {
    private readonly auditApi = inject(AuditApiService);
    private readonly live = inject(ArgentAdminLiveService);
    private readonly auditRefreshEvent = new Subject<void>();
    private readonly dictionaryApi = inject(DynamicDictionaryApiService);
    private readonly messages = inject(MessageService);
    private readonly destroyRef = inject(DestroyRef);
    private dataRequest?: Subscription;

    protected readonly dictionaries = signal<DynamicDictionarySummary[]>([]);
    protected readonly tableOptions = computed<FilterOption[]>(() => [
        { label: 'Все таблицы', value: '' },
        ...this.dictionaries().map(item => ({ label: `${item.name} (${item.code})`, value: item.code })),
    ]);
    protected readonly actionOptions: FilterOption[] = [
        { label: 'Все действия', value: '' },
        ...AUDIT_ACTIONS.map(action => ({ label: AUDIT_ACTION_LABELS[action], value: action })),
    ];

    /** Код таблицы; пусто — все таблицы. */
    protected readonly entityType = signal('');
    protected readonly entityId = signal('');
    protected readonly action = signal('');
    protected readonly fromDate = signal<Date | null>(null);
    protected readonly toDate = signal<Date | null>(null);

    protected readonly page = signal<DynamicPage<AuditEntryDto> | null>(null);
    protected readonly loading = signal(false);
    protected readonly liveConnected = signal(false);
    protected readonly refreshedAt = signal<Date | null>(null);
    protected readonly error = signal('');
    private readonly pageIndex = signal(0);
    private readonly pageSize = signal(PAGE_SIZE);

    protected readonly rows = PAGE_SIZE;

    constructor() {
        this.destroyRef.onDestroy(() => this.dataRequest?.unsubscribe());
    }

    ngOnInit(): void {
        this.dictionaryApi.getDictionaries().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: items => this.dictionaries.set(items),
            error: error => this.notifyError(error, 'Не удалось загрузить список таблиц'),
        });
        this.load();
        this.live.connect().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
            if (event.type === 'connected') this.liveConnected.set(true);
            if (event.type === 'disconnected') this.liveConnected.set(false);
            if (event.type === 'audit.changed') this.auditRefreshEvent.next();
        });
        this.auditRefreshEvent.pipe(auditTime(600), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.refresh());
        timer(15_000, 15_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            if (!this.liveConnected()) this.refresh();
        });
        timer(60_000, 60_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            if (this.liveConnected()) this.refresh();
        });
    }

    /** Применяет фильтры с первой страницы. */
    protected apply(): void {
        this.pageIndex.set(0);
        this.load();
    }

    /** Перечитывает текущую страницу с текущими фильтрами. */
    protected refresh(): void {
        this.load();
    }

    /** Сбрасывает фильтры и показывает весь журнал. */
    protected reset(): void {
        this.entityType.set('');
        this.entityId.set('');
        this.action.set('');
        this.fromDate.set(null);
        this.toDate.set(null);
        this.apply();
    }

    protected paginate(request: AuditPageRequest): void {
        this.pageIndex.set(request.page);
        this.pageSize.set(request.size);
        this.load();
    }

    private load(): void {
        this.dataRequest?.unsubscribe();
        this.loading.set(true);
        this.error.set('');
        const [from, to] = period(this.fromDate(), this.toDate());
        this.dataRequest = this.auditApi.page({
            entityType: this.entityType() ?? '',
            entityId: this.entityId() ?? '',
            action: this.action() ?? '',
            from: from ? startOfDay(from).toISOString() : undefined,
            // `to` на backend исключителен: берём начало следующего дня, чтобы выбранный день вошёл целиком.
            to: to ? startOfDay(to, 1).toISOString() : undefined,
            page: this.pageIndex(),
            size: this.pageSize(),
        }).pipe(
            finalize(() => this.loading.set(false)),
        ).subscribe({
            next: page => {
                this.page.set(page);
                this.refreshedAt.set(new Date());
            },
            error: error => {
                this.error.set(problemMessage(error, ERROR_FALLBACK));
                this.notifyError(error, 'Журнал');
            },
        });
    }

    /** Toast об ошибке; 401 и 403 уже обработал интерцептор ошибок. */
    private notifyError(error: unknown, summary: string): void {
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) return;
        this.messages.add({
            key: 'argent',
            severity: 'error',
            summary,
            detail: problemMessage(error, ERROR_FALLBACK),
        });
    }
}

/**
 * Нормализует период фильтра: некорректная дата (`Invalid Date` из ручного ввода) игнорируется,
 * а перепутанные границы (`from > to`) меняются местами — пользователь явно имел в виду этот
 * интервал, а backend ответил бы 400.
 */
function period(from: Date | null, to: Date | null): [Date | null, Date | null] {
    const validFrom = isValidDate(from) ? from : null;
    const validTo = isValidDate(to) ? to : null;
    if (validFrom && validTo && validFrom.getTime() > validTo.getTime()) {
        return [validTo, validFrom];
    }
    return [validFrom, validTo];
}

function isValidDate(date: Date | null): date is Date {
    return date instanceof Date && !isNaN(date.getTime());
}

/** Локальная полночь дня `date`, сдвинутая на `days` дней. */
function startOfDay(date: Date, days = 0): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
