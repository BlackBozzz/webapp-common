import {
    ChangeDetectionStrategy, Component, DestroyRef, Input, OnChanges, forwardRef,
    inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonDirective } from 'primeng/button';

export type ArgentEntityId = string | number;
export interface ArgentEntityOption {
    id: ArgentEntityId;
    label: string;
}

/** Извлечь поле, в том числе вложенное: profile.fullName. */
export function argentEntityPath(value: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) =>
        current !== null && typeof current === 'object'
            ? (current as Record<string, unknown>)[key] : undefined, value);
}

/** Поддержка Spring Page<T>, DynamicPage<T> и обычных массивов. */
export function argentEntityPage(value: unknown): { records: unknown[]; hasMore: boolean | null } {
    if (Array.isArray(value)) return { records: value, hasMore: false };
    if (!value || typeof value !== 'object') return { records: [], hasMore: false };
    const page = value as Record<string, unknown>;
    const records = [page['content'], page['items'], page['data']].find(Array.isArray);
    if (!Array.isArray(records)) return { records: [], hasMore: false };
    if (typeof page['last'] === 'boolean') return { records, hasMore: !page['last'] };
    if (typeof page['totalPages'] === 'number' && typeof page['number'] === 'number') {
        return { records, hasMore: page['number'] + 1 < page['totalPages'] };
    }
    if (typeof page['totalPages'] === 'number' && typeof page['page'] === 'number') {
        return { records, hasMore: page['page'] + 1 < page['totalPages'] };
    }
    return { records, hasMore: null };
}

/**
 * Универсальный селектор обычных бизнес-сущностей.
 *
 * CVA возвращает строго ID / массив ID, а не связанные объекты.
 * GET endpoint?page=0&size=20&search=... -> Page<T> | DynamicPage<T> | T[]
 * GET endpoint/{id} -> T для подписи существующего значения.
 * При нестандартном API используйте optionsLoader и recordLoader.
 */
@Component({
    selector: 'argent-entity-select',
    standalone: true,
    imports: [CommonModule, FormsModule, AutoCompleteModule, ButtonDirective],
    templateUrl: './argent-entity-select.component.html',
    styleUrl: './argent-entity-select.component.scss',
    changeDetection: ChangeDetectionStrategy.Default,
    providers: [{
        provide: NG_VALUE_ACCESSOR,
        useExisting: forwardRef(() => ArgentEntitySelectComponent),
        multi: true,
    }],
})
export class ArgentEntitySelectComponent implements ControlValueAccessor, OnChanges {
    /** URL поиска, например /api/employees. Необходим, если не задан optionsLoader. */
    @Input() endpoint = '';
    @Input() valueField = 'id';
    @Input() labelField = 'name';
    @Input() multiple = false;
    @Input() label = '';
    @Input() placeholder = 'Начните вводить для поиска';
    @Input() searchParam = 'search';
    @Input() pageParam = 'page';
    @Input() sizeParam = 'size';
    @Input() pageSize = 20;
    @Input() disabled = false;
    /** GET-запрос одной записи: {id} заменяется экранированным ID. null отключает запрос. */
    @Input() resolveEndpoint: string | null | undefined = undefined;
    /** Переопределение GET списка для нестандартных backend API. */
    @Input() optionsLoader: ((text: string, page: number, size: number) => Observable<unknown>) | null = null;
    /** Переопределение GET записи по ID (для отображения выбранных значений). */
    @Input() recordLoader: ((id: ArgentEntityId) => Observable<unknown>) | null = null;

    private readonly http = inject(HttpClient);
    private readonly destroyRef = inject(DestroyRef);
    private onChange: (value: ArgentEntityId | ArgentEntityId[] | null) => void = () => {};
    private onTouched: () => void = () => {};
    private cvaDisabled = false;
    private searchVersion = 0;
    private resolveVersion = 0;
    private currentValue: ArgentEntityId | ArgentEntityId[] | null = null;
    private query = '';
    private page = 0;
    readonly selected = signal<ArgentEntityOption | ArgentEntityOption[] | null>(null);
    readonly suggestions = signal<ArgentEntityOption[]>([]);
    readonly busy = signal(false);
    readonly hasMore = signal(false);
    readonly error = signal('');

    get isDisabled(): boolean { return this.disabled || this.cvaDisabled; }

    ngOnChanges(): void {
        // Если options/свойства API изменились, текст выбранных ID нужно разрешить заново.
        if (this.currentValue !== null) this.resolveSelection(this.currentValue);
    }

    writeValue(value: ArgentEntityId | ArgentEntityId[] | null): void {
        this.currentValue = value;
        this.resolveSelection(value);
    }
    registerOnChange(fn: (value: ArgentEntityId | ArgentEntityId[] | null) => void): void {
        this.onChange = fn;
    }
    registerOnTouched(fn: () => void): void { this.onTouched = fn; }
    setDisabledState(disabled: boolean): void { this.cvaDisabled = disabled; }
    touch(): void { this.onTouched(); }

    /** Реагирует только на пользовательский выбор; writeValue ничего не отправляет наружу. */
    choose(value: ArgentEntityOption | ArgentEntityOption[] | string | null): void {
        if (this.isDisabled) return;
        if (typeof value === 'string') return; // Строка поиска ещё не является выбранным ID.
        const options = Array.isArray(value) ? value : value ? [value] : [];
        const unique = [...new Map(options
            .filter(option => option && (typeof option.id === 'string' || typeof option.id === 'number'))
            .map(option => [String(option.id), option])).values()];
        const chosen = this.multiple ? unique : unique[0] ?? null;
        const result = this.multiple ? unique.map(item => item.id) : unique[0]?.id ?? null;
        this.currentValue = result;
        ++this.resolveVersion; // Не позволяем старому GET переписать выбор пользователя.
        this.selected.set(chosen);
        this.onChange(result);
        this.onTouched();
    }

    search(event: { query?: string }): void {
        this.query = event.query ?? '';
        this.page = 0;
        this.suggestions.set([]);
        this.hasMore.set(false);
        this.loadPage(false);
    }
    loadMore(): void {
        if (this.busy() || !this.hasMore() || this.isDisabled) return;
        this.page++;
        this.loadPage(true);
    }

    private loadPage(append: boolean): void {
        const version = ++this.searchVersion;
        const page = this.page;
        this.busy.set(true);
        this.error.set('');
        const size = Math.max(1, Math.min(100, this.pageSize));
        if (!this.optionsLoader && !this.isSafeLocalUrl(this.endpoint)) {
            this.error.set('Укажите безопасный локальный endpoint (/api/...) или optionsLoader.');
            this.busy.set(false);
            return;
        }
        const source$ = this.optionsLoader
            ? this.optionsLoader(this.query, page, size)
            : this.http.get<unknown>(this.endpoint, { params: new HttpParams()
                .set(this.searchParam, this.query)
                .set(this.pageParam, page)
                .set(this.sizeParam, size) });
        source$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: response => {
                if (version !== this.searchVersion) return;
                const result = argentEntityPage(response);
                const received = result.records.map(record => this.optionFromRecord(record))
                    .filter((item): item is ArgentEntityOption => item !== null);
                const all = append ? [...this.suggestions(), ...received] : received;
                this.suggestions.set([...new Map(all.map(option => [String(option.id), option])).values()]);
                this.hasMore.set(result.hasMore ?? result.records.length >= size);
                this.busy.set(false);
            },
            error: () => {
                if (version !== this.searchVersion) return;
                this.error.set('Не удалось загрузить варианты. Проверьте права и подключение.');
                if (append) this.page--; // повторная попытка не должна пропускать страницу
                this.busy.set(false);
            },
        });
    }

    private resolveSelection(value: ArgentEntityId | ArgentEntityId[] | null): void {
        const version = ++this.resolveVersion;
        const ids = (Array.isArray(value) ? value : value === null || value === undefined ? [] : [value])
            .filter((id): id is ArgentEntityId => typeof id === 'string' || typeof id === 'number');
        if (!ids.length) {
            this.selected.set(this.multiple ? [] : null);
            return;
        }
        const sources = ids.map(id => this.resolveRecord(id).pipe(
            map(record => this.optionFromRecord(record) ?? { id, label: String(id) }),
            catchError(() => of({ id, label: String(id) })),
        ));
        forkJoin(sources).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(options => {
            if (version !== this.resolveVersion) return;
            this.selected.set(this.multiple ? options : options[0]);
        });
    }

    private resolveRecord(id: ArgentEntityId): Observable<unknown> {
        if (this.recordLoader) return this.recordLoader(id);
        if (this.resolveEndpoint === null || !this.endpoint) return of({ [this.valueField]: id });
        const template = this.resolveEndpoint ?? `${this.endpoint.replace(/\/$/, '')}/{id}`;
        if (!this.isSafeLocalUrl(template)) return of({ [this.valueField]: id });
        // id — только сегмент URL, не произвольный путь.
        const url = template.includes('{id}')
            ? template.replace('{id}', encodeURIComponent(String(id)))
            : `${template.replace(/\/$/, '')}/${encodeURIComponent(String(id))}`;
        return this.http.get<unknown>(url);
    }

    private isSafeLocalUrl(url: string): boolean {
        // Не отправляем JWT с Angular HTTP-интерцептора на произвольный внешний хост.
        return url.startsWith('/') && !url.startsWith('//') && !url.includes('\\');
    }

    private optionFromRecord(record: unknown): ArgentEntityOption | null {
        const id = argentEntityPath(record, this.valueField);
        if (typeof id !== 'string' && typeof id !== 'number') return null;
        const label = argentEntityPath(record, this.labelField);
        return { id, label: label === undefined || label === null ? String(id) : String(label) };
    }
}
