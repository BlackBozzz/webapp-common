import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** Настройки входа: адрес REST API аутентификации service-common и маршрут страницы входа. */
export interface ArgentAuthConfig {
    /** Базовый URL API аутентификации, по умолчанию `/api/auth`. */
    apiBaseUrl: string;
    /** Маршрут страницы входа во фронтенде, по умолчанию `/login`. */
    loginPath: string;
}

const DEFAULT_AUTH_CONFIG: ArgentAuthConfig = {
    apiBaseUrl: '/api/auth',
    loginPath: '/login',
};

export const ARGENT_AUTH_CONFIG = new InjectionToken<ArgentAuthConfig>('ARGENT_AUTH_CONFIG', {
    providedIn: 'root',
    factory: () => DEFAULT_AUTH_CONFIG,
});

/**
 * Подключает настройки аутентификации к приложению-хосту.
 * Обычно вызывается из `provideArgentWebapp`, отдельно — только при ручной сборке провайдеров.
 */
export function provideArgentAuth(config: Partial<ArgentAuthConfig> = {}): EnvironmentProviders {
    return makeEnvironmentProviders([
        {
            provide: ARGENT_AUTH_CONFIG,
            useValue: {
                apiBaseUrl: (config.apiBaseUrl ?? DEFAULT_AUTH_CONFIG.apiBaseUrl).replace(/\/+$/, ''),
                loginPath: config.loginPath ?? DEFAULT_AUTH_CONFIG.loginPath,
            } satisfies ArgentAuthConfig,
        },
    ]);
}
