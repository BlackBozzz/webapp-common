import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ARGENT_DICTIONARY_CONFIG } from '../config/dynamic-dictionary.config';
import {
  DynamicDictionarySchema,
  DynamicDictionarySummary,
  DynamicOption,
  DynamicPage,
  DynamicRecordsQuery,
} from '../dto/dynamic-dictionary.dto';

/**
 * Тонкий HTTP-клиент поверх REST API service-common.
 * Не содержит привязки к конкретным Entity или DTO справочников.
 */
@Injectable({ providedIn: 'root' })
export class DynamicDictionaryApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ARGENT_DICTIONARY_CONFIG);

  /** Возвращает зарегистрированные справочники. */
  getDictionaries(): Observable<DynamicDictionarySummary[]> {
    return this.http.get<DynamicDictionarySummary[]>(this.baseUrl);
  }

  /** Возвращает расширенные метаданные формы для кода справочника. */
  getSchema(code: string): Observable<DynamicDictionarySchema> {
    return this.http.get<DynamicDictionarySchema>(`${this.dictionaryUrl(code)}/schema`);
  }

  /** Возвращает страницу полных DTO с фильтрацией, поиском и сортировкой. */
  getRecords<T = Record<string, unknown>>(
    code: string,
    query: DynamicRecordsQuery = {},
  ): Observable<DynamicPage<T>> {
    let params = this.paginationParams(query);

    if (query.sort) {
      params = params.set('sort', query.sort);
    }
    if (query.search) {
      params = params.set('search', query.search);
    }
    for (const [field, value] of Object.entries(query.filters ?? {})) {
      if (value !== null && value !== undefined) {
        params = params.set(`filter.${field}`, String(value));
      }
    }

    return this.http.get<DynamicPage<T>>(`${this.dictionaryUrl(code)}/records`, { params });
  }

  /** Возвращает варианты для выбора связанной записи. */
  getOptions(
    code: string,
    query: Pick<DynamicRecordsQuery, 'page' | 'size' | 'search'> = {},
  ): Observable<DynamicPage<DynamicOption>> {
    let params = this.paginationParams(query);
    if (query.search) {
      params = params.set('search', query.search);
    }
    return this.http.get<DynamicPage<DynamicOption>>(
      `${this.dictionaryUrl(code)}/options`,
      { params },
    );
  }

  /** Загружает одну запись в формате её зарегистрированного DTO. */
  getRecord<T = Record<string, unknown>>(code: string, id: string): Observable<T> {
    return this.http.get<T>(`${this.dictionaryUrl(code)}/records/${encodeURIComponent(id)}`);
  }

  /** Создаёт запись из полного DTO. */
  createRecord<T>(code: string, dto: T): Observable<T> {
    return this.http.post<T>(`${this.dictionaryUrl(code)}/records`, dto);
  }

  /** Полностью обновляет запись (PUT, не PATCH). */
  updateRecord<T>(code: string, id: string, dto: T): Observable<T> {
    return this.http.put<T>(
      `${this.dictionaryUrl(code)}/records/${encodeURIComponent(id)}`,
      dto,
    );
  }

  /** Удаляет запись. Успешный ответ сервера — 204 No Content. */
  deleteRecord(code: string, id: string): Observable<void> {
    return this.http.delete<void>(
      `${this.dictionaryUrl(code)}/records/${encodeURIComponent(id)}`,
    );
  }

  private get baseUrl(): string {
    return this.config.apiBaseUrl;
  }

  private dictionaryUrl(code: string): string {
    return `${this.baseUrl}/${encodeURIComponent(code)}`;
  }

  private paginationParams(query: Pick<DynamicRecordsQuery, 'page' | 'size'>): HttpParams {
    return new HttpParams()
      .set('page', query.page ?? 0)
      .set('size', query.size ?? 20);
  }
}
