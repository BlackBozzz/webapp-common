import { ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, ViewChild, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ButtonDirective } from 'primeng/button';
import { DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';

/** Преобразует выбранный файл в Base64 для поля Java byte[]. */
@Component({
    selector: 'argent-dictionary-binary-field',
    standalone: true,
    imports: [ButtonDirective],
    templateUrl: './dictionary-binary-field.component.html',
    styleUrl: './dictionary-binary-field.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryBinaryFieldComponent implements OnChanges {
    @Input({ required: true }) field!: DynamicFieldDefinition;
    @Input({ required: true }) control!: FormControl;
    /** Опционально: имя из отдельного поля DTO, если backend его хранит. */
    @Input() storedFileName: string | null = null;

    @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

    private readVersion = 0;

    get hasFile(): boolean {
        return !!this.control?.value || !!this.selectedName();
    }

    get displayName(): string {
        return this.selectedName() || this.storedFileName || 'Сохранённый файл';
    }

    readonly selectedName = signal('');
    readonly selectedSize = signal<number | null>(null);
    readonly reading = signal(false);
    readonly error = signal('');

    ngOnChanges(): void {
        this.readVersion++;
        this.selectedName.set('');
        this.selectedSize.set(null);
        this.reading.set(false);
        this.error.set('');
    }

    onFileChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const version = ++this.readVersion;
        this.selectedName.set(file.name);
        this.selectedSize.set(file.size);
        this.reading.set(true);
        this.error.set('');

        const reader = new FileReader();
        reader.onload = () => {
            if (version !== this.readVersion) return;
            const result = String(reader.result ?? '');
            const separator = result.indexOf(',');
            if (separator < 0) {
                this.error.set('Не удалось обработать содержимое файла.');
                this.reading.set(false);
                return;
            }
            this.control.setValue(result.slice(separator + 1));
            this.control.markAsDirty();
            this.control.markAsTouched();
            this.reading.set(false);
        };
        reader.onerror = () => {
            if (version !== this.readVersion) return;
            this.error.set('Не удалось прочитать файл.');
            this.reading.set(false);
            this.selectedName.set('');
            this.selectedSize.set(null);
        };
        reader.readAsDataURL(file);
    }

    clear(): void {
        this.readVersion++;
        this.control.setValue(null);
        this.control.markAsDirty();
        this.control.markAsTouched();
        this.selectedName.set('');
        this.selectedSize.set(null);
        this.reading.set(false);
        this.error.set('');
        if (this.fileInput) this.fileInput.nativeElement.value = '';
    }
}
