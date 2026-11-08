/** Поддерживаемые способы отображения содержимого колонки. */
export type ArgentTableColumnType =
    | 'string' | 'text' | 'number' | 'decimal' | 'currency' | 'boolean'
    | 'date' | 'time' | 'datetime' | 'uuid' | 'enum' | 'status'
    | 'badge' | 'relation' | 'relation-list' | 'file' | 'actions' | 'custom';

export type ArgentTableAlign = 'left' | 'center' | 'right';
export type ArgentTableExportFormat = 'xlsx' | 'csv';
export type ArgentTableExportScope = 'filtered' | 'selected' | 'page';
export type ArgentTableFilterValue = string | number | boolean | null | readonly (string | number)[];

/** Конфигурация колонки: доступна как для ручной разметки, так и для динамической схемы. */
export interface ArgentTableColumnDefinition {
    field: string;
    header: string;
    type: ArgentTableColumnType;
    width?: string;
    minWidth?: string;
    align?: ArgentTableAlign;
    sortable?: boolean;
    filterable?: boolean;
    visible?: boolean;
    frozen?: boolean;
    truncate?: boolean;
    emptyValue?: string;
    format?: string;
    currency?: string;
    locale?: string;
    decimalPlaces?: number;
    displayField?: string;
    separator?: string;
    labelMap?: Readonly<Record<string, string>>;
    severityMap?: Readonly<Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'>>;
}

/** Параметры отображения, независимые от событий PrimeNG. */
export interface ArgentTableQuery {
    page: number;
    size: number;
    search: string;
    sort: { field: string; direction: 'asc' | 'desc' } | null;
    filters: Readonly<Record<string, ArgentTableFilterValue>>;
}

/** Запрос выгрузки содержит только разрешённые и видимые колонки. */
export interface ArgentTableExportRequest {
    format: ArgentTableExportFormat;
    scope: ArgentTableExportScope;
    query: ArgentTableQuery;
    columns: readonly string[];
}
