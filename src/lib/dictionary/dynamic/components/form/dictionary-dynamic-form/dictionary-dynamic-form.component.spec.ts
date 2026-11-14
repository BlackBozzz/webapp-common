import { TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { DictionaryDynamicFormComponent } from './dictionary-dynamic-form.component';
import { DynamicDictionarySchema, DynamicFieldDefinition } from '../../../dto/dynamic-dictionary.dto';

function field(name: string, type: string, nested: DynamicFieldDefinition[] = []): DynamicFieldDefinition {
    return {
        name, label: name, type, control: 'text', fields: nested,
        description: null, placeholder: null, help: null,
        order: 0, visible: true, readOnly: false, required: false,
        minLength: null, maxLength: null, minItems: null, maxItems: null,
        minimum: null, maximum: null, pattern: null, enumValues: [],
        reference: null, validation: [], elementValidation: [],
    };
}
const schema: DynamicDictionarySchema = {
    code: 'docs', name: 'Документы', idField: 'id', displayField: 'title',
    fields: [field('title', 'string'), field('address', 'object', [field('city', 'string')])],
};
interface DocumentDto { title: string; address: { city: string }; }

describe('DictionaryDynamicFormComponent DTO mode', () => {
    it('emits nested typed DTO without editor and ignores its own return as an external update', () => {
        TestBed.configureTestingModule({});
        const component = TestBed.createComponent(DictionaryDynamicFormComponent<DocumentDto>).componentInstance;
        component.schema = schema;
        component.dto = { title: 'Первый', address: { city: 'Казань' } };
        component.ngOnChanges({ schema: new SimpleChange(null, schema, true) });
        const emitted: DocumentDto[] = [];
        component.dtoChange.subscribe(value => emitted.push(value));
        const form = component.activeForm;
        (component.activeForm.get('title') as unknown as FormControl<string>).setValue('Второй');
        expect(emitted[0]).toEqual({ title: 'Второй', address: { city: 'Казань' } });
        component.ngOnChanges({ dto: new SimpleChange(null, component.dto, false) });
        expect(component.activeForm).toBe(form);
        expect(component.getDto().title).toBe('Второй');
    });

    it('rebuilds an internal form when a different DTO arrives from the backend', () => {
        TestBed.configureTestingModule({});
        const component = TestBed.createComponent(DictionaryDynamicFormComponent<DocumentDto>).componentInstance;
        component.schema = schema;
        component.ngOnChanges({ schema: new SimpleChange(null, schema, true) });
        const external = { title: 'Из сервера', address: { city: 'Москва' } };
        component.dto = external;
        component.ngOnChanges({ dto: new SimpleChange(null, external, false) });
        expect(component.getDto()).toEqual(external);
    });
});
