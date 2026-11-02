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
}
