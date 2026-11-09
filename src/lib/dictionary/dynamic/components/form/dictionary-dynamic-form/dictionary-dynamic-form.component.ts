import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonDirective } from 'primeng/button';
import { DynamicDictionarySchema, DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';
import { DynamicDictionaryFormService } from '../../../service/dynamic-dictionary-form.service';
import { DictionaryTextFieldComponent } from '../../fields/dictionary-text-field/dictionary-text-field.component';
import { DictionaryTextareaFieldComponent } from '../../fields/dictionary-textarea-field/dictionary-textarea-field.component';
import { DictionaryNumberFieldComponent } from '../../fields/dictionary-number-field/dictionary-number-field.component';
import { DictionaryBooleanFieldComponent } from '../../fields/dictionary-boolean-field/dictionary-boolean-field.component';
import { DictionaryDateFieldComponent } from '../../fields/dictionary-date-field/dictionary-date-field.component';
import { DictionaryEnumFieldComponent } from '../../fields/dictionary-enum-field/dictionary-enum-field.component';
import { DictionaryReferenceFieldComponent } from '../../fields/dictionary-reference-field/dictionary-reference-field.component';
import { DictionaryMultiReferenceFieldComponent } from '../../fields/dictionary-multi-reference-field/dictionary-multi-reference-field.component';
import { DictionaryBinaryFieldComponent } from '../../fields/dictionary-binary-field/dictionary-binary-field.component';
import { DictionaryListFieldComponent } from '../../fields/dictionary-list-field/dictionary-list-field.component';

/** Рекурсивная сборка полей по серверной схеме, включая embedded и коллекции. */
@Component({
    selector: 'argent-dictionary-dynamic-form',
    standalone: true,
    imports: [
        CommonModule, ReactiveFormsModule, ButtonDirective,
        DictionaryTextFieldComponent, DictionaryTextareaFieldComponent,
        DictionaryNumberFieldComponent, DictionaryBooleanFieldComponent,
        DictionaryDateFieldComponent, DictionaryEnumFieldComponent,
        DictionaryReferenceFieldComponent, DictionaryMultiReferenceFieldComponent,
        DictionaryBinaryFieldComponent, DictionaryListFieldComponent,
    ],
    templateUrl: './dictionary-dynamic-form.component.html',
    styleUrl: './dictionary-dynamic-form.component.scss',
    changeDetection: ChangeDetectionStrategy.Default,
})
export class DictionaryDynamicFormComponent {
    @Input({ required: true }) schema!: DynamicDictionarySchema;
    @Input({ required: true }) form!: FormGroup;

    private readonly forms = inject(DynamicDictionaryFormService);

    get fields(): DynamicFieldDefinition[] {
        return [...(this.schema?.fields ?? [])].filter(field => field.visible && field.control !== 'hidden')
            .sort((left, right) => left.order - right.order);
    }

    child(parent: AbstractControl, field: DynamicFieldDefinition): AbstractControl {
        return (parent as FormGroup).get(field.name) ?? new FormControl(null);
    }

    scalar(control: AbstractControl): FormControl {
        return control as FormControl;
    }

    group(control: AbstractControl): FormGroup {
        return control as FormGroup;
    }

    array(control: AbstractControl): FormArray {
        return control as FormArray;
    }

    addItem(field: DynamicFieldDefinition, control: AbstractControl): void {
        this.forms.addItem(this.array(control), field);
    }

    removeItem(control: AbstractControl, index: number): void {
        this.array(control).removeAt(index);
        control.markAsDirty();
    }

    message(control: AbstractControl, field: DynamicFieldDefinition): string {
        if (!(control.invalid && (control.touched || control.dirty))) return '';
        const errors = control.errors;
        if (!errors) return '';
        if (errors['server']) return String(errors['server']);
        if (errors['required']) return 'Поле обязательно для заполнения.';
        if (errors['minlength']) return 'Слишком короткое значение.';
        if (errors['maxlength']) return 'Превышена допустимая длина.';
        if (errors['pattern']) return field.type === 'uuid'
            ? 'Введите UUID в формате 8-4-4-4-12 (цифры 0–9 и буквы A–F).'
            : 'Значение не соответствует требуемому формату.';
        if (errors['number']) return 'Введите корректное число.';
        if (errors['min']) return `Минимальное значение: ${errors['min'].min}.`;
        if (errors['max']) return `Максимальное значение: ${errors['max'].max}.`;
        return 'Некорректное значение.';
    }

    isArray(field: DynamicFieldDefinition): boolean {
        return field.type === 'array' && !field.reference;
    }
}
