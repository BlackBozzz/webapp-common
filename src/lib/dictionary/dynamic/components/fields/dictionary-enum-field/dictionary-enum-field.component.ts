import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';
@Component({
    selector: 'argent-dictionary-enum-field',
    standalone: true,
    imports: [ReactiveFormsModule, SelectModule],
    templateUrl: './dictionary-enum-field.component.html',
    styleUrl: './dictionary-enum-field.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryEnumFieldComponent {
    @Input({ required: true }) field!: DynamicFieldDefinition;
    @Input({ required: true }) control!: FormControl;
}
