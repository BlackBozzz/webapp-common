/** Описание раздела навигации административной панели. */
export interface AdminNavigationItem {
    id: string;
    title: string;
    description: string;
    /** Путь относительно /admin. */
    path: string;
    /** Короткий знак раздела, не зависящий от набора иконок. */
    glyph: string;
    /** Отключённые разделы появятся на следующих этапах. */
    enabled: boolean;
    /**
     * Код действия из грантов, без которого пункт скрыт (например `admin`).
     * Скрытие пункта — только удобство UI: доступ всё равно проверяют guard и backend.
     */
    action?: string;
}
