import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DictionaryExportFormat, DictionaryImportMode, ImportReport } from '../dto/dictionary-transfer.dto';

const EXPORT_URL = '/api/export/dictionaries';
const IMPORT_URL = '/api/import/dictionaries';

/**
 * HTTP-клиент экспорта и импорта справочников service-common.
 * Стратегия ошибок импорта задаётся на backend свойством `argent.transfer.import-on-error`.
 */
@Injectable({ providedIn: 'root' })
export class DictionaryTransferApiService {
    private readonly http = inject(HttpClient);

    /**
     * Выгрузка записей в файл. Ответ целиком — чтобы взять имя файла из `Content-Disposition`.
     * Право — `read` на справочник.
     */
    export(
        code: string,
        format: DictionaryExportFormat,
        query: { search?: string; sort?: string } = {},
    ): Observable<HttpResponse<Blob>> {
        let params = new HttpParams().set('format', format);
        if (query.search) {
            params = params.set('search', query.search);
        }
        if (query.sort) {
            params = params.set('sort', query.sort);
        }
        return this.http.get(`${EXPORT_URL}/${encodeURIComponent(code)}`, {
            params,
            observe: 'response',
            responseType: 'blob',
        });
    }

    /**
     * Загрузка файла XLSX/CSV. При ошибках в данных backend отвечает 400 с тем же отчётом
     * в свойстве `report`. Права — действие `import` и `write` на справочник.
     */
    import(code: string, file: File, mode: DictionaryImportMode): Observable<ImportReport> {
        const body = new FormData();
        body.append('file', file, file.name);
        body.append('mode', mode);
        return this.http.post<ImportReport>(`${IMPORT_URL}/${encodeURIComponent(code)}`, body);
    }
}
