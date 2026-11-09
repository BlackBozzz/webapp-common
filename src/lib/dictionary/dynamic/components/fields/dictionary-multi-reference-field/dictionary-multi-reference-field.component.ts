import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { FormControl, FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { DynamicFieldDefinition, DynamicOption } from '../../../dto/dynamic-dictionary.dto';
import { DynamicDictionaryApiService } from '../../../service/dynamic-dictionary-api.service';
import { DynamicDictionaryErrorService } from '../../../service/dynamic-dictionary-error.service';

/** Множественный выбор связанных записей с отображением чипсов. */
@Component({
    selector: 'argent-dictionary-multi-reference-field',
    standalone: true,
    imports: [FormsModule, AutoCompleteModule],
    templateUrl: './dictionary-multi-reference-field.component.html',
    styleUrl: './dictionary-multi-reference-field.component.scss',
    changeDetection: ChangeDetectionStrategy.Default,
})
export class DictionaryMultiReferenceFieldComponent implements OnChanges {
    @Input({ required: true }) field!: DynamicFieldDefinition;
    @Input({ required: true }) control!: FormControl;

    private readonly api = inject(DynamicDictionaryApiService);
    private readonly errors = inject(DynamicDictionaryErrorService);
    private readonly destroyRef = inject(DestroyRef);
    private requestId = 0;
    private searchId = 0;

    readonly selected = signal<DynamicOption[]>([]);
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
        this.selected.set(this.optionsFromDtos(this.control?.value));
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
                this.suggestions.set(page.items ?? []);
            },
            error: error => {
                if (sequence !== this.searchId) return;
                this.suggestions.set([]);
                this.error.set(this.errors.message(error));
            },
        });
    }

    choose(options: DynamicOption[] | null): void {
        const reference = this.field.reference;
        if (!reference) return;

        const sequence = ++this.requestId;
        const unique = [...new Map((options ?? [])
            .filter(option => option && typeof option === 'object' && option.id !== undefined)
            .map(option => [String(option.id), option])).values()];

        this.selected.set(unique);
        this.loading.set(true);
        this.error.set('');
        this.control.markAsPending();

        const existing = Array.isArray(this.control.value)
            ? this.control.value as Record<string, unknown>[]
            : [];
        const requests = unique.map(option => {
            const cached = existing.find(item => String(item[reference.idField]) === String(option.id));
            return cached ? of(cached) : this.api.getRecord<Record<string, unknown>>(reference.dictionaryCode, option.id);
        });
        const load$ = requests.length ? forkJoin(requests) : of([] as Record<string, unknown>[]);

        load$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: dtos => {
                if (sequence !== this.requestId) return;
                this.control.setValue(dtos);
                this.control.markAsDirty();
                this.loading.set(false);
            },
            error: error => {
                if (sequence !== this.requestId) return;
                this.control.updateValueAndValidity();
                this.selected.set(this.optionsFromDtos(this.control.value));
                this.loading.set(false);
                this.error.set(this.errors.message(error));
            },
        });
    }

    private optionsFromDtos(value: unknown): DynamicOption[] {
        const reference = this.field?.reference;
        if (!reference || !Array.isArray(value)) return [];

        return value.filter(item => item && typeof item === 'object')
            .map((item: Record<string, unknown>) => ({
                id: String(item[reference.idField]),
                label: String(item[reference.displayField || reference.idField] ?? item[reference.idField]),
            }));
    }
}
