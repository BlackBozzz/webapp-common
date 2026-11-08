/** Запрос входа; пароль не нужен, если backend настроен с `password-required=false`. */
export interface LoginRequest {
    login: string;
    password?: string;
}

/** Ответ входа и регистрации: JWT для заголовка `Authorization: Bearer`. */
export interface LoginResponse {
    token: string;
}

/** Запрос самостоятельной регистрации (если она разрешена на backend). */
export interface RegisterRequest {
    login: string;
    displayName: string;
    password: string;
}

/** Операция над таблицей в грантах. `write` не включает `read`. */
export type TableOperation = 'read' | 'write';

/**
 * Гранты пользователя — объединение грантов всех его ролей.
 * Ключ `*` в `tables` означает «любая таблица».
 */
export interface Grants {
    /** Таблица (или `*`) → разрешённые операции (`read`, `write`). */
    tables: Record<string, string[]>;
    /** Коды разрешённых действий, например `admin`. */
    actions: string[];
}

/** Текущий пользователь из `GET /api/auth/me`. */
export interface CurrentUser {
    id: string;
    login: string;
    displayName: string;
    grants: Grants;
}

/** Публичные настройки входа из `GET /api/auth/config`. */
export interface AuthConfig {
    passwordRequired: boolean;
    registrationEnabled: boolean;
}
