import type { Grants } from '../../auth/dto/auth.dto';

/** Роль в административном API (`/api/roles`) с грантами на таблицы и действия. */
export interface RoleDto {
    id: string;
    code: string;
    name: string;
    description: string | null;
    /** Системная роль (например, ADMIN) — только для чтения. */
    system: boolean;
    grants: Grants;
}

/** Тело `PUT /api/roles/{code}`: создание или изменение роли (код передаётся в пути). */
export interface RoleRequest {
    name: string;
    description?: string | null;
    grants: Grants;
}

/** Подсказки редактора грантов из `GET /api/grants/catalog`. */
export interface GrantsCatalog {
    /** Коды зарегистрированных справочников. */
    tables: string[];
    /** Коды действий приложения и встроенное `admin`. */
    actions: string[];
}
