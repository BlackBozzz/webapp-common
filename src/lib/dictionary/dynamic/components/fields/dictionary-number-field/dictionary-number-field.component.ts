import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';
/** Строковый ввод чисел без потери точности BigDecimal. */
@Component({
    selector: 'argent-dictionary-number-field',
    standalone: true,
    imports: [ReactiveFormsModule, InputTextModule],
    templateUrl: './dictionary-number-field.component.html',
    styleUrl: './dictionary-number-field.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryNumberFieldComponent {
    @Input({ required: true }) field!: DynamicFieldDefinition;
    @Input({ required: true }) control!: FormControl;
}
