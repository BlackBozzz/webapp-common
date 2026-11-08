import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DynamicPage } from '../../dictionary/dynamic/dto/dynamic-dictionary.dto';
import { ARGENT_AUDIT_CONFIG } from '../config/audit.config';
import { AuditEntryDto, AuditQuery } from '../dto/audit.dto';

/** HTTP-клиент журнала аудита; права — `read` на таблицу или действие `admin`. */
@Injectable({ providedIn: 'root' })
export class AuditApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(ARGENT_AUDIT_CONFIG).apiUrl;

    /** Страница журнала, от новых записей к старым. Пустые фильтры не передаются. */
    page(query: AuditQuery): Observable<DynamicPage<AuditEntryDto>> {
        let params = new HttpParams();
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null) continue;
            const text = String(value).trim();
            if (text) params = params.set(key, text);
        }
        return this.http.get<DynamicPage<AuditEntryDto>>(this.baseUrl, { params });
    }
}
