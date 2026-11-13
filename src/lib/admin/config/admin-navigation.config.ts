import { AdminNavigationItem } from '../dto/admin-navigation-item.dto';

/**
 * Общие пункты навигации. Пункт с `action` виден только пользователю с этим действием в грантах.
 * Наличие пункта меню само по себе не предоставляет доступ к REST API.
 */
export const ADMIN_NAVIGATION: readonly AdminNavigationItem[] = [
    {
        id: 'dashboard',
        title: 'Обзор',
        description: 'Главная страница панели',
        path: './',
        glyph: 'pi pi-home',
        enabled: true,
    },
    {
        id: 'dictionaries',
        title: 'Данные',
        description: 'Справочники и таблицы приложений',
        path: 'dictionaries',
        glyph: 'pi pi-book',
        enabled: true,
    },
    {
        id: 'api-docs',
        title: 'API и схемы',
        description: 'Swagger, DTO, структура БД, развертывание',
        path: 'api-docs',
        glyph: 'pi pi-sitemap',
        enabled: true,
        action: 'admin',
    },
    {
        id: 'queues',
        title: 'Очереди задач',
        description: 'Фоновые операции, ошибки и повторы',
        path: 'queues',
        glyph: 'pi pi-list-check',
        enabled: true,
        action: 'queue.read',
    },
    {
        id: 'users',
        title: 'Пользователи',
        description: 'Управление учётными записями',
        path: 'users',
        glyph: 'pi pi-users',
        enabled: true,
        action: 'admin',
    },
    {
        id: 'roles',
        title: 'Роли',
        description: 'Права и группы доступа',
        path: 'roles',
        glyph: 'pi pi-shield',
        enabled: true,
        action: 'admin',
    },
    {
        id: 'audit',
        title: 'Журнал изменений',
        description: 'История изменений записей и файлов',
        path: 'audit',
        glyph: 'pi pi-history',
        enabled: true,
        action: 'admin',
    },
    {
        id: 'settings',
        title: 'Настройки',
        description: 'Параметры администрирования',
        path: 'settings',
        glyph: 'pi pi-cog',
        enabled: false,
    },
];
