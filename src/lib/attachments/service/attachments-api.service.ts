import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ARGENT_ATTACHMENTS_CONFIG } from '../config/attachments.config';
import { AttachmentDto } from '../dto/attachment.dto';

/** HTTP-клиент вложений; права — `read`/`write` на таблицу записи-владельца. */
@Injectable({ providedIn: 'root' })
export class AttachmentsApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(ARGENT_ATTACHMENTS_CONFIG).apiUrl;

    list(entityType: string, entityId: string): Observable<AttachmentDto[]> {
        const params = new HttpParams().set('entityType', entityType).set('entityId', entityId);
        return this.http.get<AttachmentDto[]>(this.baseUrl, { params });
    }

    /** Загружает один файл к записи (multipart). */
    upload(entityType: string, entityId: string, file: File): Observable<AttachmentDto> {
        const body = new FormData();
        body.append('entityType', entityType);
        body.append('entityId', entityId);
        body.append('file', file, file.name);
        return this.http.post<AttachmentDto>(this.baseUrl, body);
    }

    /**
     * Содержимое файла. Скачивание идёт через `HttpClient`, потому что прямая ссылка
     * не несёт заголовок `Authorization: Bearer`.
     */
    download(id: string): Observable<Blob> {
        return this.http.get(`${this.baseUrl}/${encodeURIComponent(id)}`, { responseType: 'blob' });
    }

    remove(id: string): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(id)}`);
    }
}
