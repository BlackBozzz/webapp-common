import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ButtonDirective } from 'primeng/button';
import { DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';

/** Преобразует содержимое файла в Base64 для Jackson byte[]. */
@Component({
    selector: 'argent-dictionary-binary-field',
    standalone: true,
    imports: [ButtonDirective],
    templateUrl: './dictionary-binary-field.component.html',
    styleUrl: './dictionary-binary-field.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryBinaryFieldComponent {
    @Input({ required: true }) field!: DynamicFieldDefinition;
    @Input({ required: true }) control!: FormControl;

    fileName = '';
    error = '';

    onFileChange(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        this.fileName = file.name;
        this.error = '';
        const reader = new FileReader();
        reader.onload = () => {
            const content = String(reader.result ?? '');
            this.control.setValue(content.includes(',') ? content.split(',')[1] : content);
            this.control.markAsDirty();
        };
        reader.onerror = () => { this.error = 'Не удалось прочитать файл.'; };
        reader.readAsDataURL(file);
    }

    clear(): void {
        this.control.setValue(null);
        this.fileName = '';
    }
}
