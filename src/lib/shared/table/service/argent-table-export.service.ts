import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { downloadBlob } from '../../file-download';
import { ArgentTableColumnDefinition, ArgentTableExportFormat } from '../dto/argent-table.dto';
import { ArgentTableFormatService } from './argent-table-format.service';

/** Выгружает только переданные строки через существующий универсальный backend-экспорт. */
@Injectable({ providedIn: 'root' })
export class ArgentTableExportService {
    private readonly http = inject(HttpClient);
    private readonly format = inject(ArgentTableFormatService);

    exportPage(title: string, columns: readonly ArgentTableColumnDefinition[], rows: readonly unknown[],
               format: ArgentTableExportFormat): Observable<HttpResponse<Blob>> {
        return this.http.post('/api/export/' + format, {
            title: title || 'Таблица',
            columns: columns.map(column => ({
                key: column.field,
                label: column.header,
                type: this.exportType(column.type),
            })),
            rows: rows.map(row => Object.fromEntries(columns.map(column => {
                const value = this.format.value(row, column.field);
                const plain = ['number', 'decimal', 'currency', 'date', 'datetime', 'boolean'].includes(column.type);
                return [column.field, plain ? value ?? null : this.format.text(value, column)];
            }))),
        }, { observe: 'response', responseType: 'blob' });
    }

    download(response: HttpResponse<Blob>, title: string, format: ArgentTableExportFormat): void {
        if (!response.body) return;
        const header = response.headers.get('Content-Disposition') ?? '';
        const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)?.[1];
        let filename = `${title || 'Таблица'}.${format}`;
        if (encoded) {
            try { filename = decodeURIComponent(encoded.trim().replace(/^"|"$/g, '')); } catch { /* Имя по умолчанию. */ }
        } else {
            filename = /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1]?.trim() || filename;
        }
        downloadBlob(response.body, filename);
    }

    private exportType(type: ArgentTableColumnDefinition['type']): string {
        switch (type) {
            case 'number': case 'decimal': case 'currency': return 'NUMBER';
            case 'date': return 'DATE';
            case 'datetime': return 'DATETIME';
            case 'boolean': return 'BOOLEAN';
            default: return 'TEXT';
        }
    }
}
