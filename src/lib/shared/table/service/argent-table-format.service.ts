import { Injectable } from '@angular/core';
import { ArgentTableColumnDefinition } from '../dto/argent-table.dto';

/** Отображение табличных значений без изменения исходного DTO. */
@Injectable({ providedIn: 'root' })
export class ArgentTableFormatService {
    value(row: unknown, field: string): unknown {
        return field.split('.').reduce<unknown>((current, part) => {
            if (current === null || typeof current !== 'object') return undefined;
            return (current as Record<string, unknown>)[part];
        }, row);
    }

    text(value: unknown, column: ArgentTableColumnDefinition): string {
        if (value === null || value === undefined || value === '') return column.emptyValue ?? '—';
        const label = column.labelMap?.[String(value)];
        if (label !== undefined) return label;
        switch (column.type) {
            case 'boolean': return value ? 'Да' : 'Нет';
            case 'number': return this.number(value, column, 0);
            case 'decimal': return this.number(value, column, column.decimalPlaces ?? 2);
            case 'currency': return this.number(value, column, column.decimalPlaces ?? 2, true);
            case 'date': return this.date(value, column, 'date');
            case 'time': return this.date(value, column, 'time');
            case 'datetime': return this.date(value, column, 'datetime');
            case 'relation': return this.reference(value, column);
            case 'relation-list': return Array.isArray(value)
                ? value.map(item => this.reference(item, column)).join(column.separator ?? ', ')
                : this.reference(value, column);
            case 'file': return this.reference(value, { ...column, displayField: column.displayField ?? 'fileName' });
            default:
                if (Array.isArray(value)) return value.map(item => this.reference(item, column)).join(column.separator ?? ', ');
                if (typeof value === 'object') return this.reference(value, column);
                return String(value);
        }
    }

    private reference(value: unknown, column: ArgentTableColumnDefinition): string {
        if (value === null || value === undefined) return column.emptyValue ?? '—';
        if (typeof value !== 'object') return String(value);
        const object = value as Record<string, unknown>;
        const display = column.displayField ? this.value(object, column.displayField) : undefined;
        return String(display ?? object['label'] ?? object['name'] ?? object['title']
            ?? object['code'] ?? object['id'] ?? column.emptyValue ?? '—');
    }

    /** Строковые BigDecimal не переводим в Number при форматировании, чтобы избежать округления. */
    private number(value: unknown, column: ArgentTableColumnDefinition, digits: number, currency = false): string {
        const raw = String(value);
        if (!/^-?\d+(\.\d+)?$/.test(raw)) return raw;
        if (typeof value === 'string' && (column.type === 'decimal' || column.type === 'currency')) return raw;
        if (raw.replace(/^-/, '').replace('.', '').length > 15) return raw;
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) return raw;
        try {
            return new Intl.NumberFormat(column.locale ?? 'ru-RU', currency
                ? { style: 'currency', currency: column.currency ?? 'RUB', minimumFractionDigits: digits, maximumFractionDigits: digits }
                : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(numeric);
        } catch { return raw; }
    }

    private date(value: unknown, column: ArgentTableColumnDefinition, type: 'date' | 'time' | 'datetime'): string {
        const raw = String(value);
        // LocalDate/LocalTime из Java не содержат часового пояса: избегаем смещения даты при Date.parse.
        const date = /^\d{4}-\d{2}-\d{2}/.exec(raw)?.[0];
        const time = /T?(\d{2}:\d{2})(?::\d{2})?/.exec(raw.slice(10))?.[1];
        if (type === 'date' && date) {
            const [year, month, day] = date.split('-');
            return column.format === 'yyyy-MM-dd' ? date : `${day}.${month}.${year}`;
        }
        if (type === 'time') return /^\d{2}:\d{2}/.exec(raw)?.[0] ?? raw;
        if (date) {
            const [year, month, day] = date.split('-');
            return `${day}.${month}.${year}${time ? ' ' + time : ''}`;
        }
        return raw;
    }
}
