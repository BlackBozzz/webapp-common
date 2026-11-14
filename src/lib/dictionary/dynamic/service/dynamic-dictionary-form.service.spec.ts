import { describe, expect, it } from 'vitest';
import { DynamicDictionarySchema, DynamicFieldDefinition } from '../dto/dynamic-dictionary.dto';
import { DynamicDictionaryFormService } from './dynamic-dictionary-form.service';

function field(name: string, type = 'string', nested: DynamicFieldDefinition[] = []): DynamicFieldDefinition {
    return {
        name, label: name, type, fields: nested,
        description: null, control: 'text', placeholder: null, help: null,
        order: 0, visible: true, readOnly: false, required: false,
        minLength: null, maxLength: null, minItems: null, maxItems: null,
        minimum: null, maximum: null, pattern: null, enumValues: [],
        reference: null, validation: [], elementValidation: [],
    };
}

const schema: DynamicDictionarySchema = {
    code: 'request', name: 'Заявка', idField: 'id', displayField: 'title',
    fields: [field('title'), field('priority', 'integer'), field('details', 'object', [field('city')])],
};

class RequestDto {
    title = '';
    priority = 0;
    details = { city: '' };
}

interface RequestContract {
    title: string;
    priority: number | string | null;
    details: { city: string };
}

describe('DynamicDictionaryFormService typed business forms', () => {
    const service = new DynamicDictionaryFormService();

    it('keeps the former create()/toDto() API unchanged', () => {
        const form = service.create(schema, { title: 'A', priority: '3', details: { city: 'Казань' } });
        expect(service.toDto(schema, form)).toEqual({
            title: 'A', priority: 3, details: { city: 'Казань' },
        });
    });

    it('returns inferred DTO from class and supports typed patching', () => {
        const editor = service.createTyped(schema, RequestDto, {
            title: 'Заявка', priority: 2, details: { city: 'Москва' },
        });
        editor.patch({ title: 'Обновлено' });
        const dto: RequestDto = editor.toDto();
        expect(dto).toEqual({ title: 'Обновлено', priority: 2, details: { city: 'Москва' } });
        expect(editor.form.get('title')?.value).toBe('Обновлено');
    });

    it('supports an interface without requiring a runtime class', () => {
        const editor = service.createTyped<RequestContract>(schema, {
            title: 'Тест', priority: 10, details: { city: 'Омск' },
        });
        const dto: RequestContract = editor.toDto();
        expect(dto.priority).toBe(10);
        expect(dto.details.city).toBe('Омск');
    });

    it('can wrap an existing FormGroup for a custom parent form', () => {
        const form = service.create(schema);
        const editor = service.bindTyped<RequestContract>(schema, form);
        editor.patch({ title: 'В работе', priority: 1 });
        expect(editor.toDto().title).toBe('В работе');
    });

    it('reports missing class fields using the full DTO path', () => {
        class WrongDto { title = ''; priority = 0; }
        expect(() => service.createTyped(schema, WrongDto)).toThrow(/DTO WrongDto.*отсутствуют в классе: details/);
    });

    it('reports extra class fields that will not be serialized', () => {
        class WrongDto { title = ''; priority = 0; details = { city: '' }; unexpected = true; }
        expect(() => service.createTyped(schema, WrongDto)).toThrow(/отсутствуют в схеме: unexpected/);
    });

    it('checks nested class shape and reports the nested path', () => {
        class WrongDto { title = ''; priority = 0; details = { street: '' }; }
        expect(() => service.createTyped(schema, WrongDto)).toThrow(/WrongDto.details.*city/);
    });
    it('serializes ordinary business relations as IDs, not nested DTOs', () => {
        const relationField = {
            ...field('responsibleId', 'string'),
            entityRelation: { endpoint: '/api/employees', valueField: 'id', labelField: 'fullName' },
        };
        const listField = {
            ...field('participantIds', 'array'),
            entityRelation: { endpoint: '/api/employees', valueField: 'id', labelField: 'fullName', multiple: true },
        };
        const businessSchema: DynamicDictionarySchema = { ...schema, fields: [relationField, listField] };
        const form = service.create(businessSchema, { responsibleId: 'u1', participantIds: ['u2', 'u3'] });
        expect(service.toDto(businessSchema, form)).toEqual({ responsibleId: 'u1', participantIds: ['u2', 'u3'] });
    });

});
