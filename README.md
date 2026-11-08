# @argent/webapp-common

Angular-библиотека Argent (Angular 22, PrimeNG 22): вход по JWT, гранты ролей, административная
панель (пользователи, роли, справочники), динамические таблицы и формы справочников и единый
модуль ошибок backend. Работает в паре с backend-библиотекой `service-common`.

Все экспорты доступны из одной точки входа `@argent/webapp-common`.

## Требования

- Node.js ≥ 24.15 (Angular CLI 22 не запускается на более ранних 24.x).
- Angular CLI 22, Angular 22, PrimeNG 22, `@primeuix/themes` 3 (peer-зависимости).

## Установка

Библиотека распространяется tgz-архивом. Соберите его (см. «Сборка и упаковка») и установите
в приложение-хост, например в лежащий рядом `main-app`:

```bash
npm install ../webapp-common/dist/webapp-common/argent-webapp-common-0.4.0.tgz
```

В `package.json` хоста появится зависимость
`"@argent/webapp-common": "file:../webapp-common/dist/webapp-common/argent-webapp-common-0.4.0.tgz"`.
После пересборки архива с той же версией обычный `npm install` его **не** подхватит (npm берёт
пакет из кэша по `integrity` из `package-lock.json`): повторите `npm install <путь к tgz>`, как выше.

Бюджет initial в приложении-хосте: не менее 1.5 MB из-за PrimeNG. Начальный бандл хоста с
библиотекой весит около 1.37 MB, поэтому бюджет Angular по умолчанию (error 1MB) ломает `ng build`.
В `angular.json` хоста (`configurations.production.budgets`):

```json
{ "type": "initial", "maximumWarning": "1MB", "maximumError": "1.5MB" }
```

## Подключение: `provideArgentWebapp`

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideArgentWebapp } from '@argent/webapp-common';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
    providers: [
        provideRouter(routes),
        provideArgentWebapp({
            dictionary: { apiBaseUrl: '/api/argent-dictionary' },
            auth: { apiBaseUrl: '/api/auth', loginPath: '/login' },
            admin: { usersApiUrl: '/api/users', rolesApiUrl: '/api/roles' },
            interceptors: [],
        }),
    ],
};
```

Все опции необязательны; значения в примере — значения по умолчанию.

| Опция | Что задаёт | По умолчанию |
|---|---|---|
| `dictionary.apiBaseUrl` | REST API справочников | `/api/argent-dictionary` |
| `auth.apiBaseUrl` | REST API входа (`/login`, `/me`, `/config`, регистрация) | `/api/auth` |
| `auth.loginPath` | Маршрут страницы входа во фронтенде | `/login` |
| `admin.usersApiUrl` | REST API пользователей | `/api/users` |
| `admin.rolesApiUrl` | REST API ролей; каталог грантов берётся рядом: `/api/roles` → `/api/grants/catalog` | `/api/roles` |
| `interceptors` | Дополнительные `HttpInterceptorFn` хоста, выполняются после встроенных | `[]` |

`provideArgentWebapp` регистрирует:

- `HttpClient` с интерцепторами `authInterceptor` (заголовок `Authorization: Bearer <JWT>`)
  и `errorInterceptor` (401 → очистка токена и переход на страницу входа с `returnUrl`;
  403 → toast «Недостаточно прав» с ключом `argent`), затем `interceptors` хоста;
- токены `ARGENT_DICTIONARY_CONFIG`, `ARGENT_AUTH_CONFIG`, `ARGENT_ADMIN_API_CONFIG`;
- `MessageService` PrimeNG и тему Aura (`darkModeSelector: 'system'`).

> **Важно:** не вызывайте `provideHttpClient(...)` в хосте отдельно. Повторная регистрация
> заменит `HttpClient` версией без интерцепторов Argent — запросы уйдут без JWT, а 401/403 не
> будут обработаны. Свои интерцепторы передавайте через опцию `interceptors`.

Отдельные `provideArgentDictionary`, `provideArgentAuth`, `provideArgentAdminApi` нужны только
при ручной сборке провайдеров.

## Маршруты

```ts
// app.routes.ts
import { Routes } from '@angular/router';
import { ARGENT_AUTH_ROUTES, ARGENT_ROUTES } from '@argent/webapp-common';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'admin' },
    ...ARGENT_AUTH_ROUTES, // /login — вход (и регистрация, если она разрешена на backend)
    ...ARGENT_ROUTES,      // /admin — панель, закрыта authGuard
];
```

- `ARGENT_AUTH_ROUTES` — `/login` (`LoginPage`). После входа возвращает на `returnUrl` (или `/admin`).
- `ARGENT_ROUTES` — `/admin` под `authGuard` с вложенными `ARGENT_ADMIN_ROUTES`:
  обзор, `dictionaries` (`ARGENT_DYNAMIC_DICTIONARY_ROUTES`), `users` и `roles`
  (оба под `actionGuard('admin')`).

Запросы идут на относительные адреса `/api/...`, поэтому dev-сервер хоста проксирует их на backend
(`proxy.conf.json`, подключается в `angular.json` → `serve.options.proxyConfig`):

```json
{
    "/api/**": { "target": "http://localhost:8080", "secure": false, "changeOrigin": true }
}
```

## Guards

- `authGuard` — пускает только вошедшего. Без токена — редирект на `loginPath` с `returnUrl`.
  Если токен есть, а пользователь ещё не загружен (перезагрузка страницы), загружает его через
  `AuthStore.loadUser()`; при ошибке — тоже на страницу входа.
- `actionGuard(code)` — пускает только пользователя с действием `code` в грантах (или с
  действием `admin`, которое проходит любую проверку), иначе редирект на `/admin`.

**`actionGuard` ставится только под `authGuard`** — после него на том же маршруте или на
дочернем маршруте: сам он пользователя не загружает и без `authGuard` после перезагрузки страницы
всегда отправит на `/admin`.

```ts
{
    path: 'reports',
    canActivate: [authGuard, actionGuard('reports')],
    loadComponent: () => import('./reports.page').then(m => m.ReportsPage),
}
```

Guards и скрытие кнопок — только удобство UI: права всегда проверяет backend.

## Гранты в UI: `AuthStore`

`AuthStore` (`providedIn: 'root'`) хранит JWT (в `localStorage`, ключ `argent.auth.token`)
и текущего пользователя `user()` с грантами `Grants`: `tables` — таблица или `*` → `read`/`write`;
`actions` — коды действий.

- `canTable(table, 'read' | 'write')` — есть грант на таблицу или на `*`. `write` не включает `read`.
- `hasAction(code)` — есть ли действие, например `admin`. Держатель встроенного действия `admin`
  проходит проверку любого действия (как `@argentAccess.action(...)` на backend).
- Также: `token()`, `isAuthenticated()`, `setToken()`, `clear()` (выход), `loadUser()`.

Методы читают сигнал `user()`, поэтому в шаблоне и в `computed` пересчитываются после загрузки
пользователя:

```ts
export class OrdersPage {
    private readonly auth = inject(AuthStore);
    readonly canEdit = computed(() => this.auth.canTable('orders', 'write'));
    readonly canExport = computed(() => this.auth.hasAction('export'));
}
```

```html
@if (canEdit()) {
    <button pButton type="button" (click)="add()">Добавить</button>
}
```

## Модуль ошибок

Backend отвечает ошибками в формате RFC 9457 `ProblemDetail`; ошибки валидации приходят списком
`errors: [{ field, message }]`, где `field` — путь поля DTO (`address.city`, `items[0].name`).

- `toProblemDetail(error)` — достаёт `ProblemDetail` из `HttpErrorResponse`.
- `problemMessage(error, fallback)` — текст для toast или сообщения: `detail`, затем `title`,
  затем `fallback`; при недоступном сервере — «Сервер недоступен».
- `applyServerErrors(form, error)` — раскладывает `errors` по контролам формы как ошибку
  `server` (путь `items[0].name` → `items.0.name`; лишние префиксы Jakarta Validation
  отбрасываются). Возвращает `true`, если хотя бы одна ошибка легла на поле.
- `<argent-field-error [control]="...">` (`FieldErrorComponent`) — сообщение под полем:
  ошибка `server` и стандартные `required`, `minlength`, `maxlength`, `min`, `max`, `email`.

```ts
this.api.save(this.form.getRawValue()).subscribe({
    error: (error: unknown) => {
        if (!applyServerErrors(this.form, error)) {
            this.message = problemMessage(error, 'Не удалось сохранить');
        }
    },
});
```

```html
<input pInputText formControlName="name" />
<argent-field-error [control]="form.controls.name" />
```

## Административная панель

- Меню задаётся `ADMIN_NAVIGATION` (`AdminNavigationItem`). Пункт с полем `action` виден только
  пользователю с этим действием; «Пользователи» и «Роли» требуют `admin`. Скрытие пункта не даёт
  и не отнимает доступ — его проверяют guard и backend.
- В шапке — меню пользователя с именем и кнопкой «Выйти».
- `<p-toast key="argent">` уже есть в layout панели: toast 403 из `errorInterceptor` показывается
  в нём, добавлять его в хост не нужно (только на своих страницах вне `/admin`).
- «Пользователи» (`/admin/users`) — список с поиском и пагинацией, создание и редактирование,
  назначение ролей, смена пароля, отзыв сессий (`AdminUsersApiService`).
- «Роли» (`/admin/roles`) — список ролей, форма «код, имя, описание» и редактор грантов;
  системная роль только для просмотра (`AdminRolesApiService`, каталог грантов — `catalog()`).
- `GrantsEditorComponent` (`<argent-grants-editor>`) экспортируется отдельно: контрол форм
  (`ControlValueAccessor` с валидатором) для `Grants` — таблица «таблица → read/write» и список
  действий с подсказками из `[catalog]` (`GrantsCatalog`), плюс режим JSON. Вспомогательные
  функции: `normalizeGrants`, `parseGrantsJson`.

## Справочники

Раздел `/admin/dictionaries` строится по схемам с backend (`DynamicDictionaryApiService`):
каталог, таблица записей с серверной пагинацией, сортировкой, поиском и фильтрами, диалог
создания и редактирования с динамической формой.

- Каталог показывает только справочники с грантом `read` (`canTable(code, 'read')`);
  если таких нет — «Нет доступных справочников».
- На странице записей кнопки «Добавить», «Редактировать», «Удалить» видны только при гранте
  `write` на этот справочник.
- Ссылочные поля (одна или несколько записей другого справочника) загружают варианты из целевого
  справочника, поэтому пользователю нужен `read` и на целевой справочник — иначе backend ответит 403.

Компоненты `DictionaryDynamicFormComponent`, `DictionaryRecordDialogComponent`,
`DictionaryRecordTableComponent` и сервисы `DynamicDictionaryFormService`,
`DynamicDictionaryDisplayService`, `DynamicDictionaryErrorService` экспортируются для своих страниц.

## Тесты

```bash
npm test -- --watch=false
```

Vitest и jsdom через `ng test`.

## Сборка и упаковка

```bash
npm run build && cd dist/webapp-common && npm pack
```

Результат — `dist/webapp-common/argent-webapp-common-0.4.0.tgz`. Версия берётся из `package.json`;
при её изменении обновите путь к архиву в `package.json` хоста.
