import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** Адрес REST API журнала аудита service-common. */
export interface ArgentAuditConfig {
    /** Базовый URL API журнала, по умолчанию `/api/audit`. */
    apiUrl: string;
}

const DEFAULT_AUDIT_CONFIG: ArgentAuditConfig = {
    apiUrl: '/api/audit',
};

export const ARGENT_AUDIT_CONFIG = new InjectionToken<ArgentAuditConfig>('ARGENT_AUDIT_CONFIG', {
    providedIn: 'root',
    factory: () => DEFAULT_AUDIT_CONFIG,
});

/**
 * Подключает адрес API журнала аудита к приложению-хосту.
 * Обычно вызывается из `provideArgentWebapp`, отдельно — только при ручной сборке провайдеров.
 */
export function provideArgentAudit(config: Partial<ArgentAuditConfig> = {}): EnvironmentProviders {
    return makeEnvironmentProviders([
        {
            provide: ARGENT_AUDIT_CONFIG,
            useValue: {
                apiUrl: (config.apiUrl ?? DEFAULT_AUDIT_CONFIG.apiUrl).replace(/\/+$/, ''),
            } satisfies ArgentAuditConfig,
        },
    ]);
}
