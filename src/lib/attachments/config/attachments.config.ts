import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** Адрес REST API вложений service-common. */
export interface ArgentAttachmentsConfig {
    /** Базовый URL API вложений, по умолчанию `/api/attachments`. */
    apiUrl: string;
}

const DEFAULT_ATTACHMENTS_CONFIG: ArgentAttachmentsConfig = {
    apiUrl: '/api/attachments',
};

export const ARGENT_ATTACHMENTS_CONFIG = new InjectionToken<ArgentAttachmentsConfig>('ARGENT_ATTACHMENTS_CONFIG', {
    providedIn: 'root',
    factory: () => DEFAULT_ATTACHMENTS_CONFIG,
});

/**
 * Подключает адрес API вложений к приложению-хосту.
 * Обычно вызывается из `provideArgentWebapp`, отдельно — только при ручной сборке провайдеров.
 */
export function provideArgentAttachments(config: Partial<ArgentAttachmentsConfig> = {}): EnvironmentProviders {
    return makeEnvironmentProviders([
        {
            provide: ARGENT_ATTACHMENTS_CONFIG,
            useValue: {
                apiUrl: (config.apiUrl ?? DEFAULT_ATTACHMENTS_CONFIG.apiUrl).replace(/\/+$/, ''),
            } satisfies ArgentAttachmentsConfig,
        },
    ]);
}
