import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';
@Component({
    selector: 'argent-dictionary-date-field',
    standalone: true,
    imports: [ReactiveFormsModule, InputTextModule],
    templateUrl: './dictionary-date-field.component.html',
    styleUrl: './dictionary-date-field.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryDateFieldComponent {
    @Input({ required: true }) field!: DynamicFieldDefinition;
    @Input({ required: true }) control!: FormControl;

    get inputType(): string {
        if (this.field.type === 'datetime' || this.field.control === 'datetime') return 'datetime-local';
        if (this.field.type === 'time' || this.field.control === 'time') return 'time';
        return 'date';
    }
}
