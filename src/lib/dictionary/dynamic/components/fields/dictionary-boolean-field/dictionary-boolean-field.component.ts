import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';
@Component({
    selector: 'argent-dictionary-boolean-field',
    standalone: true,
    imports: [ReactiveFormsModule, CheckboxModule],
    templateUrl: './dictionary-boolean-field.component.html',
    styleUrl: './dictionary-boolean-field.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryBooleanFieldComponent {
    @Input({ required: true }) field!: DynamicFieldDefinition;
    @Input({ required: true }) control!: FormControl;
}
