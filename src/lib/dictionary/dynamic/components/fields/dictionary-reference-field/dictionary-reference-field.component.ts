import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnChanges, inject } from '@angular/core';
import { FormControl, FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { DynamicFieldDefinition, DynamicOption } from '../../../dto/dynamic-dictionary.dto';
import { DynamicDictionaryApiService } from '../../../service/dynamic-dictionary-api.service';
import { DynamicDictionaryErrorService } from '../../../service/dynamic-dictionary-error.service';

/** Поиск и выбор одной связанной сущности, без редактирования самой связи. */
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

    selected: DynamicOption | null = null;
    suggestions: DynamicOption[] = [];
    loading = false;
    error = '';

    ngOnChanges(): void {
        this.selected = this.optionFromDto(this.control?.value);
    }

    search(event: { query?: string }): void {
        const reference = this.field.reference;
        if (!reference) return;
        this.api.getOptions(reference.dictionaryCode, { page: 0, size: 30, search: event.query || '' })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: page => { this.suggestions = page.items; },
                error: error => { this.error = this.errors.message(error); },
            });
    }

    choose(option: DynamicOption | string | null): void {
        const reference = this.field.reference;
        const sequence = ++this.requestId;
        if (!reference || !option) {
            this.selected = null;
            this.control.setValue(null);
            this.control.markAsDirty();
            return;
        }
        if (typeof option !== 'object' || !('id' in option)) return;
        this.selected = option;
        this.loading = true;
        this.control.markAsPending();
        this.error = '';
        // Backend требует вложенный DTO целиком: проверяем существование, берём свежий DTO.
        this.api.getRecord(reference.dictionaryCode, option.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: dto => {
                    if (sequence !== this.requestId) return;
                    this.control.setValue(dto);
                    this.control.markAsDirty();
                    this.loading = false;
                },
                error: error => {
                    if (sequence !== this.requestId) return;
                    this.control.setValue(null);
                    this.selected = null;
                    this.loading = false;
                    this.error = this.errors.message(error);
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
