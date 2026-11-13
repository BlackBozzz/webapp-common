import type { FieldError, ProblemDetail } from '../../../errors/problem-detail';

/** Краткое описание справочника из GET /api/argent-dictionary. */
export interface DynamicDictionarySummary {
  code: string;
  name: string;
  /** dictionary — автоматически регистрируемый справочник, table — таблица приложения. */
  kind?: 'dictionary' | 'table';
  group?: string;
}

/** Данные о справочнике, на который ссылается поле формы. */
export interface DynamicReferenceDefinition {
  dictionaryCode: string;
  idField: string;
  displayField: string | null;
  multiple: boolean;
}

/**
 * Ограничение, переданное сервером.
 * Структура расширяемая: разные Jakarta Validation аннотации
 * могут содержать разный набор атрибутов.
 */
export type DynamicValidationRule = Readonly<Record<string, unknown>>;

/**
 * Метаданные поля из GET /{code}/schema.
 * Отсутствующие значения сервер сериализует как null.
 */
export interface DynamicFieldDefinition {
  name: string;
  label: string;
  description: string | null;
  type: string;
  control: string;
  placeholder: string | null;
  help: string | null;
  order: number;
  visible: boolean;
  readOnly: boolean;
  required: boolean;
  minLength: number | null;
  maxLength: number | null;
  minItems: number | null;
  maxItems: number | null;
  minimum: string | null;
  maximum: string | null;
  pattern: string | null;
  enumValues: string[];
  /** Русские (или другие) подписи enum из поля/getLabel() в Java. */
  enumLabels?: Readonly<Record<string, string>> | null;
  reference: DynamicReferenceDefinition | null;
  fields: DynamicFieldDefinition[];
  validation: DynamicValidationRule[];
  elementValidation: DynamicValidationRule[];
}

/** Расширенная схема динамической формы. */
export interface DynamicDictionarySchema {
  code: string;
  name: string;
  idField: string;
  displayField: string | null;
  fields: DynamicFieldDefinition[];
  kind?: 'dictionary' | 'table';
  group?: string;
  editable?: boolean;
}

/** Вариант выбора существующей записи связанного справочника. */
export interface DynamicOption {
  id: string;
  label: string;
}

/** Постраничный ответ Java DynamicPage<T>. */
export interface DynamicPage<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

/** Набор параметров запроса списка записей. */
export interface DynamicRecordsQuery {
  page?: number;
  size?: number;
  sort?: string;
  search?: string;
  filters?: Readonly<Record<string, string | number | boolean | null | undefined>>;
}

/** Ошибка валидации отдельного поля; псевдоним {@link FieldError} из модуля ошибок. */
export type DynamicFieldError = FieldError;

/** RFC 9457 ProblemDetail; псевдоним {@link ProblemDetail} из модуля ошибок. */
export type DynamicApiProblem = ProblemDetail;
