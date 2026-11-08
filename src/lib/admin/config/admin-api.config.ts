import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** Адреса REST API администрирования service-common (пользователи и роли). */
export interface ArgentAdminApiConfig {
    /** Базовый URL API пользователей, по умолчанию `/api/users`. */
    usersApiUrl: string;
    /** Базовый URL API ролей, по умолчанию `/api/roles`. */
    rolesApiUrl: string;
}

const DEFAULT_ADMIN_API_CONFIG: ArgentAdminApiConfig = {
    usersApiUrl: '/api/users',
    rolesApiUrl: '/api/roles',
};

export const ARGENT_ADMIN_API_CONFIG = new InjectionToken<ArgentAdminApiConfig>('ARGENT_ADMIN_API_CONFIG', {
    providedIn: 'root',
    factory: () => DEFAULT_ADMIN_API_CONFIG,
});

/**
 * Подключает адреса API администрирования к приложению-хосту.
 * Обычно вызывается из `provideArgentWebapp`, отдельно — только при ручной сборке провайдеров.
 */
export function provideArgentAdminApi(config: Partial<ArgentAdminApiConfig> = {}): EnvironmentProviders {
    return makeEnvironmentProviders([
        {
            provide: ARGENT_ADMIN_API_CONFIG,
            useValue: {
                usersApiUrl: (config.usersApiUrl ?? DEFAULT_ADMIN_API_CONFIG.usersApiUrl).replace(/\/+$/, ''),
                rolesApiUrl: (config.rolesApiUrl ?? DEFAULT_ADMIN_API_CONFIG.rolesApiUrl).replace(/\/+$/, ''),
            } satisfies ArgentAdminApiConfig,
        },
    ]);
}
