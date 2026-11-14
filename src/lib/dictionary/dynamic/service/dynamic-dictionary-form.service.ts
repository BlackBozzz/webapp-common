import { Injectable } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { DynamicDictionarySchema, DynamicFieldDefinition } from '../dto/dynamic-dictionary.dto';

export type DictionaryRecord = Record<string, unknown>;

/** Тип DTO для проверки совпадения полей схемы и TypeScript-класса. */
export type DynamicDtoClass<T extends object> = new () => T;

/**
 * Типизированная оболочка над обычной Angular Reactive Form.
 *
 * Тип T действует во время компиляции TypeScript; сериализация следует серверной схеме.
 * Передача класса с инициализированными полями позволяет дополнительно проверить
 * их имена во время выполнения (но не заменяет валидацию значений).
 */
export interface ArgentTypedDynamicForm<T extends object> {
    readonly schema: DynamicDictionarySchema;
    readonly form: FormGroup;
    /** Заполнить поля существующей формы; посторонние поля не отправляются. */
    patch(record: Partial<T>): void;
    /** Данные для собственного POST/PUT. Тип результата — T. */
    toDto(): T;
}

/** Создание и сериализация вложенной реактивной формы по серверной схеме. */
@Injectable({ providedIn: 'root' })
export class DynamicDictionaryFormService {
    create(schema: DynamicDictionarySchema, record: DictionaryRecord = {}): FormGroup {
        return this.group(schema.fields, record);
    }

    /**
     * Создаёт форму, результат которой типизирован интерфейсом или классом DTO.
     *
     * С интерфейсом: createTyped<RepairDto>(schema, existingRecord).
     * С классом: createTyped(schema, RepairDto, existingRecord).
     *
     * С классом проверяются имена полей DTO и схемы. Чтобы TypeScript мог видеть
     * поля класса в runtime, объявляйте их с инициализаторами (например, title = '').
     */
    createTyped<T extends object>(
        schema: DynamicDictionarySchema,
        dtoClass: DynamicDtoClass<T>,
        record?: Partial<T>,
    ): ArgentTypedDynamicForm<T>;
    createTyped<T extends object>(
        schema: DynamicDictionarySchema,
        record?: Partial<T>,
    ): ArgentTypedDynamicForm<T>;
    createTyped<T extends object>(
        schema: DynamicDictionarySchema,
        dtoClassOrRecord?: DynamicDtoClass<T> | Partial<T>,
        record?: Partial<T>,
    ): ArgentTypedDynamicForm<T> {
        const dtoClass = typeof dtoClassOrRecord === 'function' ? dtoClassOrRecord : null;
        if (dtoClass) {
            this.assertDtoShape(schema, dtoClass);
        }
        const initial = dtoClass ? record : dtoClassOrRecord as Partial<T> | undefined;
        return this.bindTyped<T>(schema, this.create(schema, (initial ?? {}) as DictionaryRecord));
    }

    /** Использовать уже созданный FormGroup с типизированным DTO. */
    bindTyped<T extends object>(schema: DynamicDictionarySchema, form: FormGroup): ArgentTypedDynamicForm<T> {
        return {
            schema,
            form,
            patch: value => form.patchValue(value as Record<string, unknown>),
            toDto: () => this.toDto(schema, form) as T,
        };
    }

    /** Удобный вызов без оболочки: forms.toTypedDto<MyDto>(schema, form). */
    toTypedDto<T extends object>(schema: DynamicDictionarySchema, form: FormGroup): T {
        return this.toDto(schema, form) as T;
    }

    /**
     * Проверка имён полей в классе DTO (включая вложенные объекты с начальными значениями).
     * При использовании только интерфейса TypeScript такие проверки в runtime невозможны.
     */
    /** Проверить модель DTO без создания редактора. Вызывается компонентом при [dtoClass]. */
    validateDtoClass<T extends object>(schema: DynamicDictionarySchema, dtoClass: DynamicDtoClass<T>): void {
        this.assertDtoShape(schema, dtoClass);
    }

    private assertDtoShape<T extends object>(schema: DynamicDictionarySchema, dtoClass: DynamicDtoClass<T>): void {
        const dto = new dtoClass();
        this.assertFieldNames(schema.fields, dto, dtoClass.name || 'DTO', new WeakSet<object>());
    }

    private assertFieldNames(
        fields: DynamicFieldDefinition[],
        value: object,
        path: string,
        visited: WeakSet<object>,
    ): void {
        if (visited.has(value)) return;
        visited.add(value);

        const expected = new Set(fields.map(field => field.name));
        const actual = new Set(Object.keys(value));
        const missing = [...expected].filter(name => !actual.has(name));
        const extra = [...actual].filter(name => !expected.has(name));
        if (missing.length || extra.length) {
            const details = [
                missing.length ? `отсутствуют в классе: ${missing.join(', ')}` : '',
                extra.length ? `отсутствуют в схеме: ${extra.join(', ')}` : '',
            ].filter(Boolean).join('; ');
            throw new Error(`Несоответствие схемы и DTO ${path}: ${details}. `
                + 'Инициализируйте все поля класса значениями (можно null).');
        }

        for (const field of fields) {
            if (field.type !== 'object' || field.reference || field.entityRelation) continue;
            const nested = (value as Record<string, unknown>)[field.name];
            if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
                this.assertFieldNames(field.fields, nested, `${path}.${field.name}`, visited);
            }
        }
    }

    group(fields: DynamicFieldDefinition[], record: DictionaryRecord = {}): FormGroup {
        const controls: Record<string, AbstractControl> = {};

        for (const field of fields) {
            if (field.type === 'array' && !field.reference && !field.entityRelation) {
                const values = Array.isArray(record[field.name]) ? record[field.name] as unknown[] : [];
                controls[field.name] = this.array(field, values);
            } else if (field.type === 'object' && !field.reference && !field.entityRelation) {
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
            if (field.entityRelation) {
                // Произвольные REST-связи передают только идентификаторы.
                dto[field.name] = original;
            } else if (field.reference) {
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
                dto[field.name] = this.serializeInteger(original);
            } else if (field.type === 'decimal' || field.type === 'number') {
                // Строкой передаём BigDecimal без потери точности JavaScript Number.
                dto[field.name] = this.serializeDecimal(original);
            } else if (field.type === 'boolean') {
                dto[field.name] = original === null ? null : Boolean(original);
            } else if (['instant', 'offsetdatetime', 'zoneddatetime'].includes(field.type)) {
                dto[field.name] = this.serializeZonedDateTime(original);
            } else if (field.type === 'datetime') {
                dto[field.name] = original === '' ? null : original;
            } else {
                dto[field.name] = original === '' && field.type !== 'string' ? null : original;
            }
        }

        return dto;
    }

    private inputValue(field: DynamicFieldDefinition, value: unknown): unknown {
        if (value === undefined || value === null) {
            return null;
        }
        if (['instant', 'offsetdatetime', 'zoneddatetime'].includes(field.type)
                && typeof value === 'string') {
            // datetime-local показывает локальное время браузера; UTC и смещения обрабатываем отдельно.
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? value : this.localDateTime(date);
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
        if (field.type === 'uuid') {
            // UUID вводится в каноническом формате, без фигурных скобок.
            result.push(Validators.pattern(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/));
        }

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

    /** Для Instant/OffsetDateTime передаём время с часовым поясом (UTC). */
    private serializeZonedDateTime(value: unknown): string | null {
        if (value === null || value === undefined || value === '') return null;
        const date = new Date(String(value));
        return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
    }

    private localDateTime(date: Date): string {
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
            + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    /** Проверяет точность и границы без преобразования больших чисел в Number. */
    private numericValidator(field: DynamicFieldDefinition): ValidatorFn {
        return (control: AbstractControl): ValidationErrors | null => {
            const raw = control.value;
            if (raw === null || raw === undefined || raw === '') return null;

            const text = this.normalizeNumericText(raw);
            if (!text) return null;
            const integer = field.type === 'integer';
            const pattern = integer ? /^[+-]?\d+$/ : /^[+-]?\d+(?:\.\d+)?$/;
            if (!pattern.test(text)) return { number: true };

            // Учитываем границы, полученные из Java-типа и Jakarta Validation.
            // BigInt позволяет сравнивать Long и BigInteger без потери точности.
            if (field.minimum !== null &&
                    this.compareDecimal(text, field.minimum) < 0) {
                return { min: { min: field.minimum, actual: text } };
            }
            if (field.maximum !== null &&
                    this.compareDecimal(text, field.maximum) > 0) {
                return { max: { max: field.maximum, actual: text } };
            }
            return null;
        };
    }

    /** Превращает пустое числовое поле в null, а не в пустую строку. */
    private serializeInteger(value: unknown): number | string | null {
        if (value === null || value === undefined) return null;
        const text = this.normalizeNumericText(value);
        if (!text) return null;
        // Некорректное значение не должно доходить до этого метода: форма должна быть валидной.
        if (!/^[+-]?\d+$/.test(text)) return text;
        const integer = BigInt(text);
        const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
        return integer >= -maxSafe && integer <= maxSafe ? Number(integer) : integer.toString();
    }

    private serializeDecimal(value: unknown): string | null {
        if (value === null || value === undefined) return null;
        const text = this.normalizeNumericText(value);
        return text || null;
    }

    private normalizeNumericText(value: unknown): string {
        return String(value).trim().replace(',', '.');
    }

    /** Точное сравнение обычных десятичных чисел, в том числе больших и дробных. */
    private compareDecimal(left: string, right: string): number {
        const [leftDigits, leftScale] = this.decimalParts(left);
        const [rightDigits, rightScale] = this.decimalParts(right);
        const scale = Math.max(leftScale, rightScale);
        const first = leftDigits * 10n ** BigInt(scale - leftScale);
        const second = rightDigits * 10n ** BigInt(scale - rightScale);
        return first < second ? -1 : first > second ? 1 : 0;
    }

    private decimalParts(value: string): [bigint, number] {
        const text = this.normalizeNumericText(value);
        const negative = text.startsWith('-');
        const unsigned = text.replace(/^[+-]/, '');
        const [whole, fraction = ''] = unsigned.split('.');
        const digits = BigInt(whole + fraction);
        return [negative ? -digits : digits, fraction.length];
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
