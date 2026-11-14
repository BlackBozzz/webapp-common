import {
    ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnDestroy,
    Output, SimpleChanges, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ButtonDirective } from 'primeng/button';
import { DynamicDictionarySchema, DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';
import {
    DictionaryRecord, DynamicDictionaryFormService, DynamicDtoClass,
} from '../../../service/dynamic-dictionary-form.service';
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
import { ArgentEntitySelectComponent } from '../../../../../entity-select/argent-entity-select.component';

/**
 * Поля по схеме, без собственного HTTP или кнопок сохранения.
 *
 * Новый режим: <argent-dictionary-dynamic-form [(dto)]="document" [schema]="schema" />
 * Компонент создаёт FormGroup сам, а `dtoChange` выдаёт результат сериализации.
 *
 * Старый режим [form]="form" полностью сохранён для CRUD справочников.
 * T проверяется TypeScript на стороне родительского компонента; интерфейс не существует в runtime.
 */
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
        ArgentEntitySelectComponent,
    ],
    templateUrl: './dictionary-dynamic-form.component.html',
    styleUrl: './dictionary-dynamic-form.component.scss',
    changeDetection: ChangeDetectionStrategy.Default,
})
export class DictionaryDynamicFormComponent<T extends object = DictionaryRecord> implements OnChanges, OnDestroy {
    @Input({ required: true }) schema!: DynamicDictionarySchema;
    /** Совместимость: существующий FormGroup из справочника; если не задан — создаётся автоматически. */
    @Input() form: FormGroup | null = null;
    /** Значение для редактирования; в двусторонней привязке сразу обновляется типизированный DTO. */
    @Input() dto: T | null = null;
    /** Необязательная проверка имён полей схемы против инициализированного DTO-класса. */
    @Input() dtoClass: DynamicDtoClass<T> | null = null;
    @Output() readonly dtoChange = new EventEmitter<T>();

    readonly forms = inject(DynamicDictionaryFormService);
    activeForm: FormGroup = new FormGroup({});
    private valueSubscription?: Subscription;
    private lastEmittedDto: T | null = null;

    get invalid(): boolean { return this.activeForm.invalid; }
    get valid(): boolean { return this.activeForm.valid; }
    get pending(): boolean { return this.activeForm.pending; }
    get dirty(): boolean { return this.activeForm.dirty; }
    get touched(): boolean { return this.activeForm.touched; }

    get fields(): DynamicFieldDefinition[] {
        return [...(this.schema?.fields ?? [])]
            .filter(field => field.visible && field.control !== 'hidden')
            .sort((left, right) => left.order - right.order);
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.schema) return;
        if (changes['schema'] || changes['form'] || changes['dtoClass']) {
            this.bindForm();
        } else if (changes['dto'] && this.dto !== this.lastEmittedDto) {
            // Новый DTO пришёл снаружи (например, после GET). Не перезаписываем форму
            // результатом её собственного dtoChange — иначе терялся бы фокус ввода.
            this.applyExternalValue();
        }
    }

    ngOnDestroy(): void { this.valueSubscription?.unsubscribe(); }

    /** Получить актуальные данные без ожидания change detection / подписки на dtoChange. */
    getDto(): T { return this.forms.toTypedDto<T>(this.schema, this.activeForm); }
    markAllAsTouched(): void { this.activeForm.markAllAsTouched(); }

    /** Полностью заменить данные; корректно пересобирает вложенные массивы в автономном режиме. */
    reset(value: T | null = null): void {
        this.dto = value;
        this.lastEmittedDto = null;
        if (this.form) {
            this.activeForm.reset(value as Record<string, unknown> | undefined, { emitEvent: false });
        } else {
            this.bindForm();
        }
        this.publishDto();
    }

    child(parent: AbstractControl, field: DynamicFieldDefinition): AbstractControl {
        return (parent as FormGroup).get(field.name) ?? new FormControl(null);
    }
    scalar(control: AbstractControl): FormControl { return control as FormControl; }
    group(control: AbstractControl): FormGroup { return control as FormGroup; }
    array(control: AbstractControl): FormArray { return control as FormArray; }

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
        return field.type === 'array' && !field.reference && !field.entityRelation;
    }

    private bindForm(): void {
        this.valueSubscription?.unsubscribe();
        if (this.dtoClass) this.forms.validateDtoClass(this.schema, this.dtoClass);
        this.activeForm = this.form ?? this.forms.create(this.schema, this.asRecord(this.dto));
        if (this.form && this.dto !== null) {
            this.activeForm.patchValue(this.asRecord(this.dto), { emitEvent: false });
        }
        this.valueSubscription = this.activeForm.valueChanges.subscribe(() => this.publishDto());
    }

    private applyExternalValue(): void {
        if (!this.form) {
            // patchValue не способен создать элементы FormArray, поэтому при подстановке
            // записи с сервера автономную форму безопаснее построить заново.
            this.bindForm();
        } else {
            this.activeForm.patchValue(this.asRecord(this.dto), { emitEvent: false });
        }
    }

    private publishDto(): void {
        if (!this.schema) return;
        const result = this.getDto();
        this.dto = result;
        this.lastEmittedDto = result;
        this.dtoChange.emit(result);
    }

    private asRecord(value: object | null | undefined): DictionaryRecord {
        return (value ?? {}) as DictionaryRecord;
    }
}
