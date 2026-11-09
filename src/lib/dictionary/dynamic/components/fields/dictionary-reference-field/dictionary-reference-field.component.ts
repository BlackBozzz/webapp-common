import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { FormControl, FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { DynamicFieldDefinition, DynamicOption } from '../../../dto/dynamic-dictionary.dto';
import { DynamicDictionaryApiService } from '../../../service/dynamic-dictionary-api.service';
import { DynamicDictionaryErrorService } from '../../../service/dynamic-dictionary-error.service';

/** Поиск и выбор одной существующей связанной записи. */
@Component({
    selector: 'argent-dictionary-reference-field',
    standalone: true,
    imports: [FormsModule, AutoCompleteModule],
    templateUrl: './dictionary-reference-field.component.html',
    styleUrl: './dictionary-reference-field.component.scss',
    changeDetection: ChangeDetectionStrategy.Default,
})
export class DictionaryReferenceFieldComponent implements OnChanges {
    @Input({ required: true }) field!: DynamicFieldDefinition;
    @Input({ required: true }) control!: FormControl;

    private readonly api = inject(DynamicDictionaryApiService);
    private readonly errors = inject(DynamicDictionaryErrorService);
    private readonly destroyRef = inject(DestroyRef);
    private requestId = 0;
    private searchId = 0;

    readonly selected = signal<DynamicOption | null>(null);
    readonly suggestions = signal<DynamicOption[]>([]);
    readonly loading = signal(false);
    readonly error = signal('');
    readonly queryText = signal('');
    readonly emptyMessage = computed(() => {
        if (this.error()) return 'Не удалось загрузить варианты';
        return this.queryText().trim() ? 'Ничего не найдено' : 'Нет доступных записей';
    });

    ngOnChanges(): void {
        ++this.requestId;
        ++this.searchId;
        this.selected.set(this.optionFromDto(this.control?.value));
        this.suggestions.set([]);
        this.loading.set(false);
        this.error.set('');
    }

    search(event: { query?: string }): void {
        const reference = this.field.reference;
        const sequence = ++this.searchId;
        this.queryText.set(event.query ?? '');
        this.error.set('');

        if (!reference) {
            this.suggestions.set([]);
            return;
        }

        this.api.getOptions(reference.dictionaryCode, {
            page: 0,
            size: 30,
            search: event.query ?? '',
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: page => {
                if (sequence !== this.searchId) return;
                // PrimeNG AutoComplete прекращает встроенную загрузку
                // при изменении входных suggestions, включая пустой массив.
                this.suggestions.set(page.items ?? []);
            },
            error: error => {
                if (sequence !== this.searchId) return;
                this.suggestions.set([]);
                this.error.set(this.errors.message(error));
            },
        });
    }

    choose(option: DynamicOption | string | null): void {
        const reference = this.field.reference;
        const sequence = ++this.requestId;

        if (!reference || !option) {
            this.selected.set(null);
            this.loading.set(false);
            this.error.set('');
            this.control.setValue(null);
            this.control.markAsDirty();
            return;
        }

        // Текст запроса — ещё не выбранная запись.
        if (typeof option !== 'object' || !('id' in option)) return;

        this.selected.set(option);
        this.loading.set(true);
        this.error.set('');
        this.control.markAsPending();

        // Для валидации вложенных DTO загружаем объект целиком.
        this.api.getRecord(reference.dictionaryCode, option.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: dto => {
                    if (sequence !== this.requestId) return;
                    this.control.setValue(dto);
                    this.control.markAsDirty();
                    this.loading.set(false);
                },
                error: error => {
                    if (sequence !== this.requestId) return;
                    this.control.setValue(null);
                    this.selected.set(null);
                    this.loading.set(false);
                    this.error.set(this.errors.message(error));
                },
            });
    }

    private optionFromDto(value: unknown): DynamicOption | null {
        const reference = this.field?.reference;
        if (!reference || !value || typeof value !== 'object') return null;

        const record = value as Record<string, unknown>;
        const id = record[reference.idField];
        if (id === null || id === undefined) return null;

        return {
            id: String(id),
            label: String(record[reference.displayField || reference.idField] ?? id),
        };
    }
}
