import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormArray, FormControl } from '@angular/forms';
import { ButtonDirective } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { InputTextModule } from 'primeng/inputtext';
import { DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';

/** Редактор простого массива значений с отображением элементов чипсами. */
@Component({
    selector: 'argent-dictionary-list-field',
    standalone: true,
    imports: [ButtonDirective, ChipModule, InputTextModule],
    templateUrl: './dictionary-list-field.component.html',
    styleUrl: './dictionary-list-field.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryListFieldComponent {
    @Input({ required: true }) field!: DynamicFieldDefinition;
    @Input({ required: true }) control!: FormArray;

    draft = '';

    get values(): unknown[] {
        return this.control.getRawValue() as unknown[];
    }

    add(): void {
        const value = this.draft.trim();
        if (!value || this.field.readOnly) return;
        this.control.push(new FormControl(value));
        this.control.markAsDirty();
        this.draft = '';
    }

    remove(index: number): void {
        if (this.field.readOnly) return;
        this.control.removeAt(index);
        this.control.markAsDirty();
    }
}
