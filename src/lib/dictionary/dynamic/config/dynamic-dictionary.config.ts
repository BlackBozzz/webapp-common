import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** Настройки интеграции с REST API библиотеки service-common. */
export interface ArgentDictionaryConfig {
  /** Базовый URL, например /api/argent-dictionary. */
  apiBaseUrl: string;
}

export const ARGENT_DICTIONARY_CONFIG = new InjectionToken<ArgentDictionaryConfig>(
  'ARGENT_DICTIONARY_CONFIG',
  { providedIn: 'root', factory: () => ({ apiBaseUrl: '/api/argent-dictionary' }) },
);

/**
 * Подключает адрес API справочников к приложению-хосту.
 * Обычно вызывается из `provideArgentWebapp`, отдельно — только при ручной сборке провайдеров.
 */
export function provideArgentDictionary(
  config: Partial<ArgentDictionaryConfig> = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ARGENT_DICTIONARY_CONFIG,
      useValue: {
        apiBaseUrl: (config.apiBaseUrl ?? '/api/argent-dictionary').replace(/\/+$/, ''),
      } satisfies ArgentDictionaryConfig,
    },
  ]);
}
