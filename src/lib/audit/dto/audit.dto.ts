/** Действие, записанное в журнал аудита. */
export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'REPLACE' | 'ATTACH' | 'DETACH';

/** Все действия журнала в порядке показа в фильтре. */
export const AUDIT_ACTIONS: readonly AuditAction[] = ['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'ATTACH', 'DETACH'];

/** Русские подписи действий журнала. */
export const AUDIT_ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
    INSERT: 'Создание',
    UPDATE: 'Изменение',
    DELETE: 'Удаление',
    REPLACE: 'Замена',
    ATTACH: 'Файл добавлен',
    DETACH: 'Файл удалён',
};

/** Запись журнала аудита из `GET /api/audit`. */
export interface AuditEntryDto {
    id: string;
    entityType: string;
    entityId: string | null;
    action: AuditAction | string;
    field: string | null;
    oldValue: string | null;
    newValue: string | null;
    actorId: string | null;
    actorLogin: string | null;
    /** Момент ISO-8601. */
    createdAt: string;
}

/** Фильтры и страница журнала; пустые значения в запрос не попадают. */
export interface AuditQuery {
    /** Таблица; без неё журнал доступен только `admin`. */
    entityType?: string;
    entityId?: string;
    action?: AuditAction | string;
    /** Начало периода (включительно), ISO-8601. */
    from?: string;
    /** Конец периода (исключительно), ISO-8601. */
    to?: string;
    /** Номер страницы с 0. */
    page?: number;
    /** Размер страницы 1..500. */
    size?: number;
}
