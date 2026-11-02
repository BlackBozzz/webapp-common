import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';
@Component({
    selector: 'argent-dictionary-text-field',
    standalone: true,
    imports: [ReactiveFormsModule, InputTextModule],
    templateUrl: './dictionary-text-field.component.html',
    styleUrl: './dictionary-text-field.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryTextFieldComponent {
    @Input({ required: true }) field!: DynamicFieldDefinition;
    @Input({ required: true }) control!: FormControl;
}
