import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TextareaModule } from 'primeng/textarea';
import { DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';
@Component({
    selector: 'argent-dictionary-textarea-field',
    standalone: true,
    imports: [ReactiveFormsModule, TextareaModule],
    templateUrl: './dictionary-textarea-field.component.html',
    styleUrl: './dictionary-textarea-field.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryTextareaFieldComponent {
    @Input({ required: true }) field!: DynamicFieldDefinition;
    @Input({ required: true }) control!: FormControl;
}
