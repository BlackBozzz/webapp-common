import { AdminNavigationItem } from '../dto/admin-navigation-item.dto';

/**
 * Общие пункты навигации. Позже тут появятся настройки доступа по ролям.
 * Наличие пункта меню само по себе не предоставляет доступ к REST API.
 */
export const ADMIN_NAVIGATION: readonly AdminNavigationItem[] = [
    {
        id: 'dashboard',
        title: 'Обзор',
        description: 'Главная страница панели',
        path: './',
        glyph: '⌂',
        enabled: true,
    },
    {
        id: 'dictionaries',
        title: 'Справочники',
        description: 'Данные и динамические формы',
        path: 'dictionaries',
        glyph: '▦',
        enabled: true,
    },
    {
        id: 'users',
        title: 'Пользователи',
        description: 'Управление учётными записями',
        path: 'users',
        glyph: '♙',
        enabled: false,
    },
    {
        id: 'roles',
        title: 'Роли',
        description: 'Права и группы доступа',
        path: 'roles',
        glyph: '◇',
        enabled: false,
    },
    {
        id: 'settings',
        title: 'Настройки',
        description: 'Параметры администрирования',
        path: 'settings',
        glyph: '⚙',
        enabled: false,
    },
];
