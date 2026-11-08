import { HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import Aura from '@primeuix/themes/aura';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { ArgentAdminApiConfig, provideArgentAdminApi } from '../admin/config/admin-api.config';
import { ArgentAttachmentsConfig, provideArgentAttachments } from '../attachments/config/attachments.config';
import { ArgentAuditConfig, provideArgentAudit } from '../audit/config/audit.config';
import { ArgentAuthConfig, provideArgentAuth } from '../auth/config/auth.config';
import { authInterceptor } from '../auth/interceptor/auth.interceptor';
import { errorInterceptor } from '../auth/interceptor/error.interceptor';
import {
    ArgentDictionaryConfig,
    provideArgentDictionary,
} from '../dictionary/dynamic/config/dynamic-dictionary.config';

/** Конфигурация общих веб-компонентов Argent. */
export interface ArgentWebappConfig {
    dictionary?: Partial<ArgentDictionaryConfig>;
    /** Настройки входа: адрес API аутентификации и маршрут страницы входа. */
    auth?: Partial<ArgentAuthConfig>;
    /** Адреса API администрирования пользователей и ролей. */
    admin?: Partial<ArgentAdminApiConfig>;
    /** Адрес API вложений, по умолчанию `/api/attachments`. */
    attachments?: Partial<ArgentAttachmentsConfig>;
    /** Адрес API журнала аудита, по умолчанию `/api/audit`. */
    audit?: Partial<ArgentAuditConfig>;
    /** Дополнительные интерцепторы хоста; выполняются после `authInterceptor` и `errorInterceptor`. */
    interceptors?: HttpInterceptorFn[];
}

/**
 * Настраивает HTTP (с JWT и обработкой 401/403), API справочников, аутентификации, администрирования, вложений и журнала,
 * `MessageService` для toast и тему PrimeNG в приложении-хосте.
 * Вызывать один раз в app.config.ts; маршруты подключаются отдельно.
 */
export function provideArgentWebapp(config: ArgentWebappConfig = {}): EnvironmentProviders {
    return makeEnvironmentProviders([
        provideHttpClient(
            withInterceptors([authInterceptor, errorInterceptor, ...(config.interceptors ?? [])]),
        ),
        provideArgentDictionary(config.dictionary),
        provideArgentAuth(config.auth),
        provideArgentAdminApi(config.admin),
        provideArgentAttachments(config.attachments),
        provideArgentAudit(config.audit),
        MessageService,
        providePrimeNG({
            theme: {
                preset: Aura,
                options: {
                    darkModeSelector: false,
                },
            },
        }),
    ]);
}
