# @argent/webapp-common — справочник

Детали к [README](../README.md). Всё перечисленное экспортируется из `@argent/webapp-common`.
Backend-сторона (эндпоинты, гранты, свойства `argent.*`) — в [`service-common`](../../service-common/README.md).

## `provideArgentWebapp(config)`

Вызывается один раз в `app.config.ts`. Все опции необязательны.

| Опция | Что задаёт | По умолчанию |
|---|---|---|
| `dictionary.apiBaseUrl` | REST API справочников | `/api/argent-dictionary` |
| `auth.apiBaseUrl` | REST API входа (`/login`, `/register`, `/config`, `/me`, `/logout`) | `/api/auth` |
| `auth.loginPath` | Маршрут страницы входа во фронтенде | `/login` |
| `admin.usersApiUrl` | REST API пользователей | `/api/users` |
| `admin.rolesApiUrl` | REST API ролей; каталог грантов — рядом: `/api/roles` → `/api/grants/catalog` | `/api/roles` |
| `attachments.apiUrl` | REST API вложений | `/api/attachments` |
| `audit.apiUrl` | REST API журнала аудита | `/api/audit` |
| `interceptors` | Свои `HttpInterceptorFn`; выполняются после встроенных | `[]` |

Конечный `/` в адресах отбрасывается. Экспорт и импорт справочников всегда идут на
`/api/export/dictionaries/{code}` и `/api/import/dictionaries/{code}` (отдельной опции нет).

Регистрирует:

- `HttpClient` с `authInterceptor`, `errorInterceptor`, затем `interceptors` хоста;
- токены `ARGENT_DICTIONARY_CONFIG`, `ARGENT_AUTH_CONFIG`, `ARGENT_ADMIN_API_CONFIG`,
  `ARGENT_ATTACHMENTS_CONFIG`, `ARGENT_AUDIT_CONFIG`;
- `MessageService` PrimeNG и тему Aura (`darkModeSelector: 'system'`).

Не вызывайте `provideHttpClient(...)` в хосте: повторная регистрация заменит `HttpClient` версией
без интерцепторов Argent — запросы уйдут без JWT, 401/403 не обработаются.

Для ручной сборки провайдеров есть `provideArgentDictionary`, `provideArgentAuth`,
`provideArgentAdminApi`, `provideArgentAttachments`, `provideArgentAudit` (те же объекты опций).

## Маршруты

- `ARGENT_AUTH_ROUTES` — `/login` (`LoginPage`). По `GET /api/auth/config` показывает поле пароля
  и переключатель регистрации, если backend их требует/разрешает. После входа — на `returnUrl`
  (только внутренний путь, иначе `/admin`).
- `ARGENT_ROUTES` — `/admin` под `authGuard`, внутри `ARGENT_ADMIN_ROUTES`:

| Путь | Страница | Доступ |
|---|---|---|
| `/admin` | обзор | вошедший |
| `/admin/dictionaries`, `/admin/dictionaries/:code` | каталог и записи (`ARGENT_DYNAMIC_DICTIONARY_ROUTES`) | вошедший; данные — по грантам |
| `/admin/users` | пользователи | `actionGuard('admin')` |
| `/admin/roles` | роли | `actionGuard('admin')` |
| `/admin/audit` | журнал изменений | `actionGuard('admin')` |

Меню — `ADMIN_NAVIGATION` (`AdminNavigationItem`): пункт с `action` виден только пользователю с этим
действием. Скрытие пункта не даёт и не отнимает доступ.

## Интерцепторы

- `authInterceptor` добавляет `Authorization: Bearer <JWT>`, если пользователь вошёл, и только когда:
  - URL относительный (`/...`, но не `//...`) или того же origin, что страница, — иначе токен
    утёк бы на внешние API;
  - путь не `${auth.apiBaseUrl}/login`, `/register`, `/config` — на открытых путях входа устаревший
    токен приводит к 401 от фильтра аутентификации.
- `errorInterceptor`:
  - 401 (кроме самого запроса входа) — `AuthStore.clear()` и переход на `loginPath?returnUrl=…`
    (если уже на странице входа — только очистка);
  - 403 — toast «Недостаточно прав» в `<p-toast key="argent">`;
  - ошибка всегда пробрасывается дальше вызывающему коду.

### Toast с ключом `argent`

Сообщения интерцептора и компонентов `argent-attachments`, `argent-audit-log` идут с `key: 'argent'`,
но в разные `MessageService`:

- `errorInterceptor` — функциональный интерцептор, выполняется в environment-инжекторе, где
  зарегистрирован `HttpClient`, поэтому 403-toast **всегда** уходит в корневой `MessageService`
  (из `provideArgentWebapp`), а не в сервис страницы;
- компоненты берут ближайший `MessageService` по дереву инжекторов.

Отсюда правила:

- внутри `/admin` корневой toast уже есть: `<p-toast key="argent">` в layout админки;
- своя страница вне `/admin` добавляет `<p-toast key="argent" />` в компонент, который **не**
  предоставляет свой `MessageService` (тогда toast привязан к корневому сервису и покажет и 403,
  и сообщения компонентов);
- страница со своим `providers: [MessageService]` получает сообщения компонентов в свой сервис —
  ей нужен дополнительно свой `<p-toast key="argent" />` (так сделано на странице записей
  справочника); 403 по-прежнему покажет корневой toast.

Компоненты на 403 свой toast не показывают: его уже показал `errorInterceptor`.

## Guards

- `authGuard` — без токена редирект на `loginPath` с `returnUrl`. Если токен есть, а пользователь
  не загружен (перезагрузка страницы), вызывает `AuthStore.loadUser()`; при ошибке — на вход.
- `actionGuard(code)` — пускает пользователя с действием `code` (или `admin`), иначе `/admin`.
  Ставится **только после `authGuard`** (на том же или родительском маршруте): сам пользователя
  не загружает и после перезагрузки страницы без `authGuard` всегда отправит на `/admin`.

```ts
{ path: 'reports', canActivate: [authGuard, actionGuard('reports')], loadComponent: () => import('./reports.page').then(m => m.ReportsPage) }
```

Guards и скрытие кнопок — удобство UI; права всегда проверяет backend.

## `AuthStore`

`providedIn: 'root'`. JWT хранится в `localStorage` под ключом `AUTH_TOKEN_STORAGE_KEY`
(`argent.auth.token`); недоступное хранилище не ошибка — токен живёт в памяти.

| Член | Что делает |
|---|---|
| `token()` | JWT или `null` (signal) |
| `user()` | `CurrentUser` (`id`, `login`, `displayName`, `grants`) или `null`, пока не загружен |
| `isAuthenticated()` | есть ли токен (пользователь мог ещё не загрузиться) |
| `canTable(table, 'read' \| 'write')` | грант на таблицу или на `*`. `write` не включает `read`; действие `admin` таблиц не открывает |
| `hasAction(code)` | действие `code` в грантах; держатель `admin` проходит любую проверку действия |
| `setToken(token)` | сохранить JWT |
| `clear()` | забыть токен и пользователя (выход) |
| `loadUser()` | `GET /api/auth/me` → `user` |

`canTable`/`hasAction` читают сигнал `user()`, поэтому в `computed` и шаблоне пересчитываются после
загрузки пользователя. HTTP-клиент входа — `AuthApiService` (`config`, `login`, `register`, `logout`, `me`).

## Модуль ошибок

Backend отвечает RFC 9457 `ProblemDetail`; ошибки валидации — `errors: [{ field, message }]`.

- `toProblemDetail(error)` — `ProblemDetail` из `HttpErrorResponse`.
- `problemMessage(error, fallback)` — `detail`, затем `title`, затем `fallback`; без связи с
  сервером — «Сервер недоступен».
- `applyServerErrors(form, error)` — кладёт `errors` на контролы как ошибку `server`
  (`items[0].name` → `items.0.name`, префиксы Jakarta Validation отбрасываются); `true`, если хоть
  одна легла на поле.
- `<argent-field-error [control]="form.controls.name" />` — первая ошибка поля (`server`, `required`,
  `minlength`, `maxlength`, `min`, `max`, `email`).

## Компоненты

| Селектор | Inputs | Outputs | Назначение |
|---|---|---|---|
| `argent-attachments` | `entityType`*, `entityId`*, `readonly` (`false`) | — | Файлы записи: список, скачивание; загрузка и удаление при `write` и `!readonly` |
| `argent-audit-log` | `entityType`*, `entityId`*, `pageSize` (`20`) | — | История записи; видна при `read` на таблицу или `admin` |
| `argent-audit-table` | `page`, `loading`, `rows` (`20`), `showEntity` (`false`) | `lazyLoad` (`AuditPageRequest`) | Таблица журнала; данные не грузит сама |
| `argent-dictionary-import-dialog` | `code`*, `visible` | `visibleChange`, `imported` (`ImportReport`) | Импорт XLSX/CSV: режим UPSERT/REPLACE, отчёт по строкам (и при 400 с `report`) |
| `argent-dictionary-record-dialog` | `code`*, `schema`*, `recordId`, `visible`, `readonly` | `visibleChange`, `saved` | Создание/редактирование; при `recordId` вкладки «Поля», «Файлы», «История»; `readonly` — просмотр без сохранения |
| `argent-dictionary-record-table` | `schema`*, `page`, `loading`, `selected`, `filters` | `selectedChange`, `queryChange`, `filterChange` | Таблица записей с серверной пагинацией |
| `argent-dictionary-dynamic-form` | `schema`*, `form`* | — | Динамическая форма по схеме |
| `argent-grants-editor` | `catalog`, `inputId` | — (`ControlValueAccessor` + валидатор) | Редактор `Grants`: таблицы, действия, режим JSON |
| `argent-field-error` | `control`* | — | Сообщение под полем |

`*` — обязательный. `argent-attachments`, `argent-audit-log` и вкладки диалога записи требуют
`MessageService` у предка (его даёт `provideArgentWebapp`) и `<p-toast key="argent">` в видимом
месте (см. выше).

Таблицы `argent-audit-table` и `argent-dictionary-record-table` стоят с `lazyLoadOnInit=false`:
первую страницу запрашивает владелец, следующие — по событию таблицы (иначе первый запрос ушёл бы
дважды).

## Сервисы и утилиты

| Сервис | Методы |
|---|---|
| `DynamicDictionaryApiService` | `getDictionaries`, `getSchema`, `getRecords`, `getOptions`, `getRecord`, `createRecord`, `updateRecord`, `deleteRecord` |
| `DictionaryTransferApiService` | `export(code, 'xlsx' \| 'csv', {search?, sort?})` → `HttpResponse<Blob>` (право `read`); `import(code, file, 'UPSERT' \| 'REPLACE')` → `ImportReport` (действие `import` + `write`; при ошибках в данных — 400 с `report`) |
| `AttachmentsApiService` | `list`, `upload` (multipart, один файл), `download` (Blob через `HttpClient`, т.к. прямая ссылка не несёт Bearer), `remove` |
| `AuditApiService` | `page(AuditQuery)`: `entityType`, `entityId`, `action`, `from`, `to` (ISO, `to` исключителен), `page`, `size`; пустые фильтры не передаются; без `entityType` — только `admin` |
| `AdminUsersApiService`, `AdminRolesApiService` | API пользователей и ролей (`catalog()` — подсказки грантов) |

- `downloadBlob(blob, fileName)` — сохраняет Blob через временную ссылку `a[download]`; URL
  отзывается в `setTimeout`, т.к. некоторые браузеры начинают скачивание асинхронно.
- `AUDIT_ACTIONS`, `AUDIT_ACTION_LABELS` — действия журнала (`INSERT`, `UPDATE`, `DELETE`, `REPLACE`,
  `ATTACH`, `DETACH`) и русские подписи.
- `normalizeGrants`, `parseGrantsJson` — нормализация и разбор грантов.

## Справочники в UI

- Каталог показывает справочники с `read`; иначе «Нет доступных справочников».
- «Добавить», «Редактировать», «Удалить» — при `write`; экспорт — при `read`; импорт — при `write`
  и действии `import`. Стратегия ошибок импорта — на backend (`argent.transfer.import-on-error`).
- Ссылочные поля грузят варианты из целевого справочника — нужен `read` и на него, иначе 403.
- Диалог записи при каждом открытии берёт свежий DTO с сервера; «Сохранить» видна только на вкладке «Поля».

## Кастомизация

- Свои интерцепторы — `provideArgentWebapp({ interceptors: [...] })`.
- Свои страницы — свои маршруты рядом с `ARGENT_ROUTES` под `authGuard`/`actionGuard`.
- Свои формы — `argent-attachments`, `argent-audit-log`, `argent-dictionary-dynamic-form` и сервисы выше.
- Бюджет `initial` хоста — не меньше `1.5MB` (`angular.json` → `configurations.production.budgets`).

## Тесты и сборка

```bash
npm test -- --watch=false                                   # Vitest + jsdom через ng test
npm run build && cd dist/webapp-common && npm pack          # → argent-webapp-common-<версия>.tgz
```

Версия берётся из `package.json` (сейчас `0.6.0`). После пересборки с той же версией в хосте
повторите `npm install <путь к tgz>` — обычный `npm install` берёт пакет из кэша по `integrity`.
