/** Метаданные файла, прикреплённого к записи `entityType`/`entityId`. */
export interface AttachmentDto {
    id: string;
    /** Таблица записи-владельца; права на файл — права на эту таблицу. */
    entityType: string;
    entityId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    /** Логин загрузившего; `null`, если пользователь неизвестен. */
    uploadedLogin: string | null;
    /** Время загрузки в ISO-8601. */
    createdAt: string;
}
