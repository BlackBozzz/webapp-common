import { provideHttpClient } from '@angular/common/http';
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import Aura from '@primeuix/themes/aura';
import { providePrimeNG } from 'primeng/config';
import {
    ArgentDictionaryConfig,
    provideArgentDictionary,
} from '../dictionary/dynamic/config/dynamic-dictionary.config';

/** Конфигурация общих веб-компонентов Argent. */
export interface ArgentWebappConfig {
    dictionary?: Partial<ArgentDictionaryConfig>;
}

/**
 * Настраивает HTTP, API справочников и тему PrimeNG в приложении-хосте.
 * Вызывать один раз в app.config.ts; маршруты подключаются отдельно.
 */
export function provideArgentWebapp(config: ArgentWebappConfig = {}): EnvironmentProviders {
    return makeEnvironmentProviders([
        provideHttpClient(),
        provideArgentDictionary(config.dictionary),
        providePrimeNG({
            theme: {
                preset: Aura,
                options: {
                    darkModeSelector: 'system',
                },
            },
        }),
    ]);
}
