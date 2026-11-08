# ArgentTable — единый табличный компонент

## Включение

В `main-app` по-прежнему устанавливается пакет `@argent/webapp-common`. Ни Java-код, ни `main-app/app.routes.ts` менять не требуется.

В standalone-компоненте приложения добавьте импорты:

```typescript
import {
    ArgentTableComponent,
    ArgentTableColumnComponent,
    ArgentTableCellDirective,
    ArgentTableToolbarEndDirective,
    ArgentTableQuery,
    ArgentTableExportRequest,
} from '@argent/webapp-common';

@Component({
    selector: 'app-example-page',
    standalone: true,
    imports: [ArgentTableComponent, ArgentTableColumnComponent,
        ArgentTableCellDirective, ArgentTableToolbarEndDirective],
    templateUrl: './example-page.component.html',
    styleUrl: './example-page.component.scss',
})
export class ExamplePageComponent {
    rows = [{ id: 1, name: 'Пример', createdAt: '2026-11-09', active: true }];

    reload(): void {
        // Загрузка из собственного API, либо обновление локальных данных.
    }
}
```

Шаблон (каждый компонент по-прежнему имеет три отдельных файла):

```html
<argent-table title="Мои записи"
    rowKey="id"
    [rows]="rows"
    [lazy]="false"
    (refreshRequested)="reload()"
>
    <ng-template argentTableToolbarEnd>
        <button pButton
            type="button"
            (click)="reload()"
        >Моё действие</button>
    </ng-template>
    <argent-table-column field="id"
        header="ID"
        type="number"
        width="90px"
        [sortable]="true"
    ></argent-table-column>
    <argent-table-column field="name"
        header="Название"
        type="string"
        [sortable]="true"
        [filterable]="true"
    ></argent-table-column>
    <argent-table-column field="createdAt"
        header="Дата"
        type="date"
    ></argent-table-column>
    <argent-table-column field="active"
        header="Активен"
        type="boolean"
    ></argent-table-column>
</argent-table>
```

Использование собственной ячейки:

```html
<argent-table-column field="status"
    header="Статус"
    type="custom"
>
    <ng-template argentTableCell let-row>
        <strong>{{ row.status }}</strong>
    </ng-template>
</argent-table-column>
```

## Публичные компоненты

- `ArgentTableComponent` — сама таблица, пагинация, поиск, фильтры, выбор строки, работа с тулбаром.
- `ArgentTableColumnComponent` — декларативное описание колонки.
- `ArgentTableToolbarComponent` — действия «Обновить», «Экспорт», «Импорт» справа сверху.
- `ArgentTableCellDirective` — пользовательские шаблоны ячеек.
- `ArgentTableToolbarStartDirective`, `ArgentTableToolbarEndDirective` — пользовательские шаблоны действий.
- `ArgentTableFormatService` — отображение значений, вложенных путей и связей.
- `ArgentTableExportService` — экспорт переданных строк через `/api/export/{format}`.

Для каждой колонки доступны `field`, `header`, `type`, `width`, `minWidth`, `align`, `sortable`, `filterable`, `visible`, `frozen`, `truncate`, `emptyValue`, `format`, `currency`, `locale`, `decimalPlaces`, `displayField`, `separator`, `labelMap`, `severityMap`.

Типы: `string`, `text`, `number`, `decimal`, `currency`, `boolean`, `date`, `time`, `datetime`, `uuid`, `enum`, `status`, `badge`, `relation`, `relation-list`, `file`, `actions`, `custom`.

`file` по умолчанию показывает название файла и скрепку без небезопасного автоматического открытия URL.

## Серверная и локальная таблица

`lazy=true` (по умолчанию): страница отвечает за получение страниц. Событие `queryChange` передаёт:

```typescript
{
    page: 0,
    size: 20,
    search: '',
    sort: { field: 'name', direction: 'asc' },
    filters: { name: 'Москва' }
}
```

`lazy=false`: таблица фильтрует и сортирует уже переданные строки; серверных запросов не делает. Поиск и фильтры работают только с загруженными данными.

При смене поиска и фильтров страница сбрасывается на ноль. Начальную страницу серверного списка загружает владелец, без двойного HTTP-запроса.

## Экспорт: важно различать два режима

*Общий экспорт*: стандартный `exportMode='page'` выгружает **только переданные в `[rows]` записи**, используя существующий backend `POST /api/export/xlsx` или `/csv`. Нельзя выдавать его за экспорт всех строк с сервера.

*Специализированный экспорт*: `exportMode='external'` отключает стандартный POST. По `(exportRequested)` владелец выполняет свой серверный экспорт по всему набору, включая сортировку и поиск. Динамические справочники уже используют этот режим через `GET /api/export/dictionaries/{code}`. Текущий backend-экспорт справочников **пока не поддерживает все по-колоночные фильтры**.

Кнопка «Экспорт» по умолчанию включена; «Импорт» находится рядом справа сверху и включается `[showImport]="true"`. Фактическую операцию импорта выполняет страница в обработчике `(importRequested)`.

Права доступа проверяет backend. Универсальный компонент не заменяет проверки доступа на сервере.

## Интеграция текущего проекта

В новую таблицу переведены экран справочника, журнал аудита, страницы пользователей и ролей. Диалоги и сервисы API сохранены. Вложенный `AuditLogComponent` также использует общий `AuditTableComponent`, который теперь является оболочкой над ArgentTable.

## Стили и соглашения

Тёмное графитовое меню и белая рабочая область задаются `AdminLayout` и вложенными компонентами. Внешний вид всех таблиц централизован в `ArgentTable`.

Сохраняем: отдельная папка на компонент и три файла `.ts`/`.html`/`.scss`, без лишнего `public`, порядок Input/Output/ViewChild/private/getter/fields/lambdas/constructor/methods/private methods; первый атрибут на строке открывающего тега и явные закрывающие теги.
