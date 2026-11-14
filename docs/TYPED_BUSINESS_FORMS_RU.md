# AtomSkills — типизированные бизнес-формы и связи с сущностями

## Назначение

В `webapp-common` есть два независимых механизма:

- `<argent-dictionary-dynamic-form>` отображает поля, описанные `DynamicDictionarySchema`. Компонент **сам** создаёт `FormGroup` (если не передан `[form]`), валидирует поля и выдаёт JSON-совместимый DTO через `[(dto)]`. Никакого `editor` или обязательного сервиса в странице не нужно.
- `<argent-entity-select>` — стандартный компонент Angular `ControlValueAccessor` (CVA), выбирающий **один ID или массив ID** обычных бизнес-сущностей через REST. Работает также без динамической формы, в собственных Reactive Forms.

Оба компонента — **не генераторы приложения**. Backend, миграции, интерфейсы, ручная бизнес-логика и POST/PUT/PATCH остаются в коде проекта.

## 1. Использование `<argent-dictionary-dynamic-form>` без editor

```typescript
export interface DocumentSaveDto {
    title: string;
    details: { note: string };
    responsibleId: string | null;
}

// На странице:
// schema: DynamicDictionarySchema — загружена GET /api/argent-dictionary/{code}/schema
// dto — переменная с типом собственного DTO.
document: DocumentSaveDto = {
    title: '',
    details: { note: '' },
    responsibleId: null,
};

save(): void {
    const form = this.documentForm; // @ViewChild('documentForm')
    form.markAllAsTouched();
    if (form.invalid || form.pending || this.saving) return;
    const dto: DocumentSaveDto = form.getDto();
    this.http.post('/api/documents', dto).subscribe(/* твоя логика */);
}
```

```html
<div class="argent-form">
    <argent-dictionary-dynamic-form
        #documentForm
        [schema]="schema"
        [(dto)]="document"
    />

    <div class="argent-form__actions">
        <button
            pButton
            type="button"
            [disabled]="documentForm.invalid || documentForm.pending || saving"
            (click)="save()"
        >Сохранить</button>
    </div>
</div>
```

В TS у `document` всегда есть подсказки IDE: `document.title`, `document.details.note`, `document.responsibleId`. `dtoChange` срабатывает при изменении поля, `getDto()` возвращает **самое свежее** значение синхронно. Это обычный JSON-совместимый объект, не инстанс класса с методами. Типы TypeScript удаляются при компиляции — серверная валидация обязательна.

Можно использовать собственный HTML `<form>` вокруг компонента, если нужна обработка события `submit`: динамический компонент не содержит вложенного тега `<form>`. Внешнему `<form>` **необязательно** назначать `[formGroup]`, потому что компонент управляет им сам. Кнопке внутри такого `<form>` ставь `type="submit"`, вызывай `event.preventDefault()` в обработчике обычного события `(submit)`.

### Типизированный DTO-класс и runtime-проверка

```typescript
export class DocumentSaveDto {
    title = '';
    details = { note: '' };
    responsibleId: string | null = null;
}
```

```html
<argent-dictionary-dynamic-form
    [schema]="schema"
    [dtoClass]="documentDtoClass"
    [(dto)]="document"
/>
```

В TS страницы укажи `readonly documentDtoClass = DocumentSaveDto;`. При создании класса все поля **должны быть инициализированы**, иначе JavaScript не позволит сравнить структуру. Проверяются имена и вложенность полей, но не runtime-типы значений. Если DTO содержит поля, отсутствующие в схеме (например, `createdAt`), используй отдельный DTO для сохранения или не передавай `[dtoClass]`.

### Редактирование, вложенные DTO, массивы

`dto` можно заменить новым объектом после GET:

```typescript
this.http.get<DocumentSaveDto>(`/api/documents/${id}`).subscribe(dto => {
    this.document = dto; // форма перестраивает вложенные FormGroup / FormArray
});
```

Для вложенных DTO схема содержит поле `type: 'object'` с массивом `fields`. Для списка объектов — `type: 'array'` с дочерними полями. Сериализация рекурсивная; `integer` может возвращать `number | string` для больших значений, `decimal` — строку для сохранения точности. Остальные правила `DynamicDictionaryFormService` не изменены.

### Методы и свойства

| API | Тип | Назначение |
| --- | --- | --- |
| `[schema]` | `DynamicDictionarySchema` | Обязательно: описание полей формы |
| `[(dto)]` | `T` | Двустороннее привязывание типизированного результата |
| `[dtoClass]` | `new () => T` | Необязательно: проверка имён полей класса |
| `[form]` | `FormGroup` | Необязательно: старый режим управления формой снаружи |
| `#ref.invalid`, `.valid`, `.pending`, `.dirty`, `.touched` | `boolean` | Текущее состояние формы |
| `#ref.getDto()` | `T` | Сериализованный DTO без ожидания событий |
| `#ref.markAllAsTouched()` | `void` | Показать ошибки перед сохранением |
| `#ref.reset(dto?)` | `void` | Сбросить или заменить значение; уведомить `dtoChange` |

Старое API `DynamicDictionaryFormService.create()`, `createTyped()`, `bindTyped()`, `toDto()` и `[form]="form"` **не удалено**. Оно по-прежнему используется в CRUD-админке.

## 2. Связь с обычными бизнес-сущностями

### Одна запись: ManyToOne/OneToOne (ID)

```typescript
interface DocumentSaveDto { title: string; responsibleId: string | null; }

form = new FormGroup({
    responsibleId: new FormControl<string | null>(null),
});
```

```html
<argent-entity-select
    label="Ответственный"
    endpoint="/api/employees"
    valueField="id"
    labelField="profile.fullName"
    placeholder="Найдите сотрудника"
    [formControl]="form.controls.responsibleId"
/>
```

### Несколько записей: ManyToMany (массив ID)

```typescript
form = new FormGroup({
    participantIds: new FormControl<string[]>([], { nonNullable: true }),
});
```

```html
<argent-entity-select
    label="Участники"
    endpoint="/api/employees"
    valueField="id"
    labelField="profile.fullName"
    [multiple]="true"
    [formControl]="form.controls.participantIds"
/>
```

`valueField` и `labelField` поддерживают вложенные пути (`profile.name`). Селектор сохраняет только идентификатор/массив ID, **не** загруженные записи. Backend сам должен проверить, что выбранные IDs существуют и доступны текущему пользователю.

### REST-контракт по умолчанию

- `GET /api/employees?search=Иван&page=0&size=20` — массив, Spring Data `Page` с `content` или `DynamicPage` с `items`.
- `GET /api/employees/{id}` — одиночная запись для получения имени уже выбранного ID при редактировании.
- Если GET по ID не поддерживается, можно передать `[recordLoader]` или `[resolveEndpoint]="null"`; при отключении разрешения отображается сам ID.
- Большие наборы не загружаются целиком: доступна кнопка **«Показать ещё»**, размер задаётся `pageSize` (по умолчанию 20, максимум 100).

Если API отличается, передай `[optionsLoader]="searchFn"` и `[recordLoader]="getFn"`. Это функции `(text, page, size) => Observable<unknown>` и `(id) => Observable<unknown>` соответственно. Их объявляют как стрелочные поля класса, чтобы сохранить контекст `this`.

### Встраивание выбора в динамическую форму

В существующую схему можно добавить поле `entityRelation` (дополнение метаданных на frontend):

```typescript
const schema: DynamicDictionarySchema = {
  code: 'my-documents', name: 'Документы', idField: 'id', displayField: 'title',
  fields: [
    {
      // остальные обязательные свойства DynamicFieldDefinition — по текущему DTO схемы
      ...schemaFieldFromBackend,
      name: 'responsibleId', type: 'string', control: 'entity-select',
      entityRelation: {
        endpoint: '/api/employees', valueField: 'id', labelField: 'profile.fullName',
        multiple: false, searchParam: 'search', pageSize: 20,
      },
    },
  ],
};
```

Для множества ID используй `type: 'array'`, `entityRelation.multiple=true`. Такой элемент создаётся как `FormControl` (массив ID), а не `FormArray` элементов. Для вложенного DTO поле `type:'object'` с `fields` остаётся отдельным случаем.

**Ограничение:** в этом патче **не добавлены новые Java-аннотации для автоматической генерации `entityRelation`**. У `@ArgentDictionary` и `@ArgentDataTable` существующая логика связей сохранена. Для связей с произвольными REST API метаданные сейчас можно дополнить на frontend, либо использовать селектор напрямую в собственной форме. Это предотвращает непреднамеренное изменение backend-схемы и миграций.

### Inputs `argent-entity-select`

| Вход | По умолчанию | Значение |
| --- | --- | --- |
| `endpoint` | `''` | Локальный путь `/api/...` для GET поиска |
| `valueField` / `labelField` | `id` / `name` | Поле значения и поле подписи, включая вложенные пути |
| `multiple` | `false` | Выбор одной/нескольких записей |
| `label`, `placeholder` | `''` / подсказка | Подпись и placeholder |
| `pageSize` | `20` | Размер запроса (макс. 100) |
| `searchParam` / `pageParam` / `sizeParam` | `search` / `page` / `size` | Названия query-параметров |
| `resolveEndpoint` | `endpoint/{id}` | Путь получения выбранной записи; `null` отключает |
| `optionsLoader` / `recordLoader` | `null` | Полностью собственные Observable-загрузчики |
| `disabled` | `false` | Заблокировать выбор (CVA также получает disabled от FormControl) |

Автоматические HTTP-запросы допускают только локальные пути, начинающиеся с `/`. Это предотвращает утечку Authorization из интерцептора на сторонний домен. Для взаимодействия с внешним сервисом задавай запрос самостоятельно через `optionsLoader`/`recordLoader` и правильно настраивай безопасность.

### Ограничения типов связей

`ManyToOne` и `OneToOne` — ID, `ManyToMany` — массив ID. Для `OneToMany`, когда требуется полноценная работа с дочерними объектами, используй таблицу и собственный диалог; универсальный селектор не реализует вложенные CRUD-операции.

## 3. Стили, установка и безопасность

Глобально подключи CSS из `webapp-common/styles/argent-forms.css` (в зависимости от структуры собранной библиотеки — через `angular.json` или `@import`). Основные классы: `argent-form`, `argent-form__section`, `argent-form__section-title`, `argent-form__grid`, `argent-form__field`, `argent-form__actions`, `argent-form__error`. Они не переопределяют стили PrimeNG глобально.

Ни форма, ни селектор не содержат сохранения. Права доступа к спискам сотрудников, бизнес-логика, полнота DTO и валидация входных ID — **обязанность backend**.

### Минимальный импорт standalone-компонента

```typescript
import { DictionaryDynamicFormComponent, ArgentEntitySelectComponent } from '@argent/webapp-common';
import { ReactiveFormsModule } from '@angular/forms';

@Component({
  standalone: true,
  imports: [DictionaryDynamicFormComponent, ArgentEntitySelectComponent, ReactiveFormsModule],
})
export class BusinessPage { /* DTO, schema, запросы */ }
```

## 4. Миграция с предыдущего патча

Если проект уже использует `editor = forms.createTyped(...)`, старые вызовы продолжат работать. Для новых экранов просто используй `[(dto)]` без `editor`. Не смешивай `[form]` с новым режимом, если нет необходимости управлять внешним FormGroup: форму создаёт компонент.

Новых Java-классов, SQL-миграций и серверных REST endpoint этот патч не требует. Он совместим с текущей схемой справочников.
