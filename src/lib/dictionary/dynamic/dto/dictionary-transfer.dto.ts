/** Формат выгрузки справочника. */
export type DictionaryExportFormat = 'xlsx' | 'csv';

/** Режим импорта: дополнить (UPSERT) или заменить все записи (REPLACE). */
export type DictionaryImportMode = 'UPSERT' | 'REPLACE';

/** Ошибка одной строки импорта; `row` — номер строки файла, `field` — колонка, если известна. */
export interface ImportError {
    row: number;
    field: string | null;
    message: string;
}

/** Отчёт импорта: тело ответа 200 и свойство `report` в ProblemDetail при отмене импорта (400). */
export interface ImportReport {
    total: number;
    created: number;
    updated: number;
    failed: number;
    errors: ImportError[];
}
