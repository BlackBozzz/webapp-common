# Подготовка схемы для форм

Отдельного кода в этой папке сейчас нет: преобразование серверного `DynamicDictionarySchema`
в Angular Reactive Forms выполняет `DynamicDictionaryFormService` (`service/dynamic-dictionary-form.service.ts`).
Он строит `FormGroup` по описанию полей, переносит правила валидации (обязательность, длины,
шаблон, число элементов списка) и готовит тело запроса для сохранения записи.

Отображение значений в таблице записей делает `DynamicDictionaryDisplayService`,
а ошибки backend — `DynamicDictionaryErrorService` поверх общего модуля `errors/`
(`problemMessage`, `applyServerErrors`). Папка оставлена как место для будущих преобразований
метаданных, если они перестанут помещаться в эти сервисы.
