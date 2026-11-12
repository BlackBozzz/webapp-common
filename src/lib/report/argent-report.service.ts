import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subscription, finalize } from 'rxjs';

/** Форматы, поддерживаемые серверным ReportService. Предпросмотр доступен для PDF. */
export type ArgentReportFormat = 'pdf' | 'xlsx' | 'docx';

export interface ArgentReportOptions {
    title?: string;
    /** Имя без расширения, например `sales-2026`. */
    filename?: string;
    /** Параметры контроллера помимо `format` (автоматически подставляется сервисом). */
    params?: Readonly<Record<string, string | number | boolean>>;
    /** Формат для прямого скачивания; у show() предпросмотр всегда PDF. */
    format?: ArgentReportFormat;
}

interface ReportViewerRequest {
    url: string;
    title: string;
    filename: string;
    params?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * HTTP-клиент для JasperReports (JWT остаётся в Angular HttpInterceptor).
 * Подключите <argent-report-dialog /> один раз в layout приложения.
 *
 * load('/api/reports/sales', {format: 'xlsx', filename: 'sales'}); // сразу скачать
 * show('/api/reports/sales', {title: 'Продажи'});             // показать PDF и дать скачать
 */
@Injectable({ providedIn: 'root' })
export class ArgentReportService {
    private readonly http = inject(HttpClient);
    private readonly destroyRef = inject(DestroyRef);
    private previewSubscription?: Subscription;
    private previewObjectUrl: string | null = null;
    private previewBlob: Blob | null = null;
    private requestToken = 0;

    readonly visible = signal(false);
    readonly previewLoading = signal(false);
    readonly downloading = signal(false);
    readonly error = signal('');
    readonly previewUrl = signal<string | null>(null);
    readonly current = signal<ReportViewerRequest | null>(null);

    /** Запросить исходный Blob, если нужно самостоятельно управлять результатом. */
    fetch(url: string, format: ArgentReportFormat, params?: ArgentReportOptions['params']): Observable<Blob> {
        let httpParams = new HttpParams();
        for (const [key, value] of Object.entries(params ?? {})) {
            if (key !== 'format') httpParams = httpParams.set(key, String(value));
        }
        return this.http.get(url, {
            params: httpParams.set('format', format),
            responseType: 'blob',
        });
    }

    /** Без промежуточного окна скачивает файл с сервера (PDF, XLSX или DOCX). */
    load(url: string, options: ArgentReportOptions = {}): void {
        const format = options.format ?? 'pdf';
        const filename = this.filename(options.filename ?? 'report', format);
        this.downloadBlob(this.fetch(url, format, options.params), filename);
    }

    /** Открывает диалог предпросмотра PDF. Из него можно скачать файл в любом формате. */
    show(url: string, options: ArgentReportOptions = {}): void {
        this.close();
        const token = ++this.requestToken;
        this.current.set({
            url,
            title: options.title ?? 'Просмотр отчёта',
            filename: options.filename ?? 'report',
            params: options.params,
        });
        this.visible.set(true);
        this.previewLoading.set(true);
        this.error.set('');
        this.previewSubscription = this.fetch(url, 'pdf', options.params).pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: blob => {
                if (token !== this.requestToken) return;
                this.previewBlob = blob;
                // URL только из ответа своего API, не из пользовательской строки.
                this.previewObjectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
                this.previewUrl.set(this.previewObjectUrl);
                this.previewLoading.set(false);
            },
            error: error => {
                if (token !== this.requestToken) return;
                this.error.set(this.errorMessage(error));
                this.previewLoading.set(false);
            },
        });
    }

    /** Скачивание из открытого диалога, используя те же параметры, что и при предпросмотре. */
    downloadFromPreview(format: ArgentReportFormat): void {
        const request = this.current();
        if (!request) return;
        const filename = this.filename(request.filename, format);
        if (format === 'pdf' && this.previewBlob) {
            this.saveBlob(this.previewBlob, filename);
            return;
        }
        this.downloadBlob(this.fetch(request.url, format, request.params), filename);
    }

    close(): void {
        ++this.requestToken;
        this.previewSubscription?.unsubscribe();
        this.previewSubscription = undefined;
        this.previewLoading.set(false);
        this.previewUrl.set(null);
        if (this.previewObjectUrl) URL.revokeObjectURL(this.previewObjectUrl);
        this.previewObjectUrl = null;
        this.previewBlob = null;
        this.visible.set(false);
        this.current.set(null);
        this.error.set('');
    }

    private downloadBlob(response: Observable<Blob>, filename: string): void {
        this.downloading.set(true);
        this.error.set('');
        response.pipe(
            finalize(() => this.downloading.set(false)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: blob => this.saveBlob(blob, filename),
            error: error => this.error.set(this.errorMessage(error)),
        });
    }

    private filename(base: string, format: ArgentReportFormat): string {
        return base.replace(/\.(pdf|xlsx|docx)$/i, '') + '.' + format;
    }

    private saveBlob(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    private errorMessage(error: unknown): string {
        if (error instanceof HttpErrorResponse) {
            return `Не удалось сформировать отчёт (HTTP ${error.status}). Проверь права и настройки JasperReports.`;
        }
        return error instanceof Error ? error.message : 'Не удалось сформировать отчёт';
    }
}
