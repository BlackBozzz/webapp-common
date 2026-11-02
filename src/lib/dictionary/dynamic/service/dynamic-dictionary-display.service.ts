import { Injectable } from '@angular/core';
import { DynamicFieldDefinition } from '../dto/dynamic-dictionary.dto';

/** Представление сложных значений DTO в табличной строке. */
@Injectable({ providedIn: 'root' })
export class DynamicDictionaryDisplayService {
    format(value: unknown, field: DynamicFieldDefinition): string {
        if (value === null || value === undefined || value === '') return '—';
        if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
        if (field.reference && Array.isArray(value)) {
            return value.map(item => this.referenceName(item, field)).join(', ') || '—';
        }
        if (field.reference) return this.referenceName(value, field);
        if (Array.isArray(value)) return value.map(item => this.short(item)).join(', ') || '—';
        if (typeof value === 'object') return this.short(value);
        if (field.type === 'datetime') return String(value).replace('T', ' ');
        return String(value);
    }

    private referenceName(value: unknown, field: DynamicFieldDefinition): string {
        if (!value || typeof value !== 'object') return String(value ?? '—');
        const record = value as Record<string, unknown>;
        return String(record[field.reference?.displayField || 'name']
            ?? record[field.reference?.idField || 'id'] ?? '—');
    }

    private short(value: unknown): string {
        if (!value || typeof value !== 'object') return String(value ?? '—');
        const record = value as Record<string, unknown>;
        return String(record['name'] ?? record['title'] ?? record['code'] ?? record['id'] ?? 'Объект');
    }
}
