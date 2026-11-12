/** Пользователь в административном API (`/api/users`). */
export interface UserDto {
    id: string;
    login: string;
    displayName: string;
    email: string | null;
    enabled: boolean;
    /** Задан ли пароль (сам пароль не передаётся). */
    hasPassword: boolean;
    /** Коды ролей пользователя. */
    roles: string[];
    /** Дата создания в ISO-формате. */
    createdAt: string;
}

/** Параметры списка пользователей: поиск и серверная пагинация (страницы с 0). */
export interface UsersQuery {
    search?: string;
    page?: number;
    size?: number;
}

/** Создание пользователя; пароль необязателен (вход без пароля, если backend это разрешает). */
export interface CreateUserRequest {
    login: string;
    displayName: string;
    password?: string;
    email?: string;
}

/** Изменение имени и активности пользователя, опционально email (пустая строка удаляет адрес). */
export interface UpdateUserRequest {
    displayName: string;
    enabled: boolean;
    email?: string | null;
}

/** Установка пароля пользователю администратором. */
export interface SetPasswordRequest {
    password: string;
}

/** Полная замена набора ролей пользователя. */
export interface UserRolesRequest {
    roleCodes: string[];
}
