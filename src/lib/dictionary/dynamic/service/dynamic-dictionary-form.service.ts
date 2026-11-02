import { Injectable } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { DynamicDictionarySchema, DynamicFieldDefinition } from '../dto/dynamic-dictionary.dto';

export type DictionaryRecord = Record<string, unknown>;

/** Создание и сериализация вложенной реактивной формы по серверной схеме. */
@Injectable({ providedIn: 'root' })
export class DynamicDictionaryFormService {
    create(schema: DynamicDictionarySchema, record: DictionaryRecord = {}): FormGroup {
        return this.group(schema.fields, record);
    }

    group(fields: DynamicFieldDefinition[], record: DictionaryRecord = {}): FormGroup {
        const controls: Record<string, AbstractControl> = {};

        for (const field of fields) {
            if (field.type === 'array' && !field.reference) {
                const values = Array.isArray(record[field.name]) ? record[field.name] as unknown[] : [];
                controls[field.name] = this.array(field, values);
            } else if (field.type === 'object' && !field.reference) {
                controls[field.name] = this.group(field.fields, this.asRecord(record[field.name]));
            } else {
                controls[field.name] = new FormControl(
                    this.inputValue(field, record[field.name]),
                    { validators: this.validators(field) },
                );
            }
            if (field.readOnly) {
                controls[field.name].disable({ emitEvent: false });
            }
        }

        return new FormGroup(controls);
    }

    array(field: DynamicFieldDefinition, values: unknown[] = []): FormArray {
        return new FormArray(values.map(value => this.arrayItem(field, value)), this.arrayValidators(field));
    }

    addItem(array: FormArray, field: DynamicFieldDefinition): void {
        array.push(this.arrayItem(field, field.fields.length ? {} : ''));
        array.markAsDirty();
    }

    toDto(schema: DynamicDictionarySchema, form: FormGroup): DictionaryRecord {
        return this.serializeFields(schema.fields, form.getRawValue() as DictionaryRecord);
    }

    private arrayItem(field: DynamicFieldDefinition, value: unknown): AbstractControl {
        return field.fields.length
            ? this.group(field.fields, this.asRecord(value))
            : new FormControl(value, { validators: this.itemValidators(field) });
    }

    private serializeFields(fields: DynamicFieldDefinition[], value: DictionaryRecord): DictionaryRecord {
        const dto: DictionaryRecord = {};

        for (const field of fields) {
            if (!Object.hasOwn(value, field.name)) {
                continue;
            }

            const original = value[field.name];
            if (field.reference) {
                // Связанный DTO передаётся целиком; связанная запись не изменяется.
                dto[field.name] = original;
            } else if (field.type === 'object') {
                dto[field.name] = original === null ? null
                    : this.serializeFields(field.fields, this.asRecord(original));
            } else if (field.type === 'array') {
                dto[field.name] = Array.isArray(original)
                    ? original.map(item => field.fields.length
                        ? this.serializeFields(field.fields, this.asRecord(item))
                        : this.parseScalar(item))
                    : [];
            } else if (field.type === 'integer') {
                dto[field.name] = original === '' || original === null ? null
                    : Number.isSafeInteger(Number(original)) ? Number(original) : String(original);
            } else if (field.type === 'decimal' || field.type === 'number') {
                // Строкой передаём BigDecimal без потери точности JavaScript Number.
                dto[field.name] = original === '' || original === null ? null : String(original);
            } else if (field.type === 'boolean') {
                dto[field.name] = original === null ? null : Boolean(original);
            } else if (field.type === 'datetime') {
                dto[field.name] = original;
            } else {
                dto[field.name] = original === '' && field.type !== 'string' && field.type !== 'uuid'
                    ? null : original;
            }
        }

        return dto;
    }

    private inputValue(field: DynamicFieldDefinition, value: unknown): unknown {
        if (value === undefined || value === null) {
            return null;
        }
        if (field.type === 'datetime' && typeof value === 'string') {
            return value.replace(/Z$/, '');
        }
        return value;
    }

    private validators(field: DynamicFieldDefinition): ValidatorFn[] {
        const result: ValidatorFn[] = [];
        if (field.required && field.type !== 'boolean') {
            result.push(Validators.required);
        }
        if (field.required && field.type === 'boolean') {
            result.push(control => control.value === null || control.value === undefined
                ? { required: true } : null);
        }
        if (field.minLength !== null) result.push(Validators.minLength(field.minLength));
        if (field.maxLength !== null) result.push(Validators.maxLength(field.maxLength));
        if (field.pattern) result.push(Validators.pattern(field.pattern));

        if (['number', 'integer', 'decimal'].includes(field.type)) {
            result.push(this.numericValidator(field));
        }
        return result;
    }

    private itemValidators(field: DynamicFieldDefinition): ValidatorFn[] {
        // Для массива сервер сообщает элементные правила отдельно.
        return field.elementValidation.some(rule => rule['name'] === 'NotBlank')
            ? [Validators.required] : [];
    }

    private arrayValidators(field: DynamicFieldDefinition): ValidatorFn[] {
        const validators: ValidatorFn[] = [];
        if (field.required) validators.push(Validators.required);
        if (field.minItems !== null) validators.push(Validators.minLength(field.minItems));
        if (field.maxItems !== null) validators.push(Validators.maxLength(field.maxItems));
        return validators;
    }

    private numericValidator(field: DynamicFieldDefinition): ValidatorFn {
        return (control: AbstractControl): ValidationErrors | null => {
            const raw = control.value;
            if (raw === null || raw === undefined || raw === '') return null;
            const text = String(raw);
            if (!/^-?\d+(?:\.\d+)?$/.test(text)
                || (field.type === 'integer' && !/^-?\d+$/.test(text))) {
                return { number: true };
            }
            const value = Number(text);
            if (!Number.isFinite(value)) return { number: true };
            if (field.minimum !== null && value < Number(field.minimum)) return { min: true };
            if (field.maximum !== null && value > Number(field.maximum)) return { max: true };
            return null;
        };
    }

    private parseScalar(value: unknown): unknown {
        if (typeof value !== 'string') return value;
        const text = value.trim();
        if (text === 'true') return true;
        if (text === 'false') return false;
        if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
        return value;
    }

    private asRecord(value: unknown): DictionaryRecord {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as DictionaryRecord : {};
    }
}
