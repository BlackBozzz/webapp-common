# @argent/webapp-common

Angular-библиотека Argent (Angular 21, PrimeNG 21): страница входа по JWT, гранты в UI, админка
(пользователи, роли, справочники, журнал), вложения и история изменений записей. Работает в паре
с backend-библиотекой [`service-common`](../service-common/README.md). Все экспорты — из
`@argent/webapp-common`. Подробности: [`docs/reference.md`](docs/reference.md).

## Быстрый старт

Нужен запущенный backend на `service-common` (например, `main-backend` на `http://localhost:8080`).

### 1. Node

Node 22.12+ или 24 LTS (системный подходит).

Проверка: `node -v` печатает `v22.12.0`/`v24.x` или новее.

### 2. Сборка и установка пакета

```bash
cd webapp-common && npm install && npm run build && cd dist/webapp-common && npm pack
cd ../../../main-app      # ваше приложение-хост
npm install ../webapp-common/dist/webapp-common/argent-webapp-common-0.6.0.tgz
```

После пересборки архива с той же версией повторите `npm install <путь к tgz>`: обычный
`npm install` возьмёт старый пакет из кэша. Peer-зависимости (PrimeNG, `@primeuix/*`) npm ставит сам.
Бюджет `initial` в `angular.json` хоста (PrimeNG, ~1.3 MB) поднимите вместе: `"maximumWarning": "1.5MB"`,
`"maximumError": "2MB"`, иначе `ng build` упадёт или предупредит.

Проверка: в `package.json` хоста есть `"@argent/webapp-common": "file:…-0.6.0.tgz"`.

### 3. Провайдеры

```ts
// app.config.ts
import { provideArgentWebapp } from '@argent/webapp-common';

export const appConfig: ApplicationConfig = {
    providers: [
        provideRouter(routes),
        // добавить к существующим провайдерам
        provideArgentWebapp({}), // все адреса API по умолчанию: /api/auth, /api/users, …
    ],
};
```

`provideArgentWebapp` регистрирует `HttpClient` с интерцепторами JWT и ошибок, `MessageService`
и тему Aura. **Не вызывайте `provideHttpClient` отдельно** — он заменит `HttpClient` версией без
интерцепторов; свои передавайте в `provideArgentWebapp({ interceptors: [...] })`.
Иконки: установите `primeicons` и подключите `primeicons/primeicons.css` в глобальном файле стилей (`src/styles.css` или `src/styles.scss`)
(`@import 'primeicons/primeicons.css';`), иначе кнопки `pi pi-*` останутся без значков.

Проверка: `ng build` хоста проходит без ошибок; после запуска у кнопок экспорта видны иконки.

### 4. Маршруты

```ts
// app.routes.ts
import { ARGENT_AUTH_ROUTES, ARGENT_ROUTES } from '@argent/webapp-common';

export const routes: Routes = [
    ...ARGENT_AUTH_ROUTES, // /login
    ...ARGENT_ROUTES,      // /admin под authGuard
    { path: '', pathMatch: 'full', redirectTo: 'admin' },
];
```

Замените содержимое `app.html` (приветственная страница `ng new`) на `<router-outlet />`.

Проверка: после `npm start` адрес `http://localhost:4200/` уводит на `/login?returnUrl=%2Fadmin`.

### 5. Proxy на backend

Запросы идут на относительные `/api/...`. Файл `proxy.conf.json` рядом с `angular.json`, в
`angular.json` → `serve.options.proxyConfig: "proxy.conf.json"` (если у `serve` нет `options` — создайте):

```json
{ "/api/**": { "target": "http://localhost:8080", "secure": false, "changeOrigin": true } }
```

Backend на другом порту (`server.port` в его `application.properties`; на Windows 8080 бывает в
исключённом диапазоне Hyper-V) — тот же порт в `target`.

Проверка: `npm start`, вход под `admin` (пароль — `ARGENT_ADMIN_PASSWORD`, без пароля — если backend
запущен с профилем `demo`) открывает `/admin` с «Справочники», «Пользователи», «Роли», «Журнал изменений».

## Что появляется само

- **Справочники** (`/admin/dictionaries`): каталог по гранту `read`; записи справочника — по адресу
  `/admin/dictionaries/<код>`: поиск, фильтры, пагинация; «Добавить/Редактировать/Удалить» — при `write`,
  «Открыть» (просмотр без сохранения) — при одном `read`.
- **Экспорт XLSX/CSV** на странице записей — при `read` на справочник (с текущими поиском и
  сортировкой). **Импорт** (диалог с режимами UPSERT/REPLACE и отчётом по строкам) — при
  действии `import` и `write`.
- **Вкладки «Поля» / «Файлы» / «История»** в диалоге записи (при создании вкладок нет).
- **«Журнал изменений»** (`/admin/audit`, только `admin`): фильтры по таблице, записи, действию и периоду.

## Вложения и история в своей форме

`entityType` — имя таблицы записи, `entityId` — её id строкой. Права — гранты на эту таблицу;
скрытие кнопок — удобство UI, проверяет backend.

```html
<argent-attachments [entityType]="'dict_demo_order'" [entityId]="orderId()" />
<argent-audit-log [entityType]="'dict_demo_order'" [entityId]="orderId()" [pageSize]="10" />
```

- `<argent-attachments>`: список, скачивание, загрузка и удаление файлов; загрузка и удаление —
  при `write`, `[readonly]="true"` оставляет только просмотр.
- `<argent-audit-log>`: страницы истории изменений записи; видна при `read` на таблицу или `admin`.

Ошибки оба компонента показывают toast с ключом `argent`. Внутри `/admin` он уже есть. Вне админки
нужен `<p-toast key="argent" />` в компоненте без своего `MessageService`; странице со своим
`providers: [MessageService]` — ещё и свой такой toast (см. [reference](docs/reference.md)).

## Гранты в своих страницах

```ts
private readonly auth = inject(AuthStore);
readonly canEdit = computed(() => this.auth.canTable('orders', 'write'));
readonly canApprove = computed(() => this.auth.hasAction('orders.approve'));
```

`write` не включает `read`; действие `admin` проходит любую проверку действия, но не таблиц.
Свой маршрут: `canActivate: [authGuard, actionGuard('reports')]` (`actionGuard` — только после `authGuard`).

## Дальше

[`docs/reference.md`](docs/reference.md): все опции `provideArgentWebapp`, интерцепторы, guards,
`AuthStore`, модуль ошибок, компоненты с inputs/outputs, утилиты, тесты и сборка.
