import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
    ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { catchError, concatMap, EMPTY, finalize, from, Subscription } from 'rxjs';
import { AuthStore } from '../../../auth/service/auth.store';
import { problemMessage } from '../../../errors/problem-detail';
import { downloadBlob } from '../../../shared/file-download';
import { AttachmentDto } from '../../dto/attachment.dto';
import { AttachmentsApiService } from '../../service/attachments-api.service';

const ERROR_FALLBACK = 'Не удалось выполнить операцию';
const TEXT_PREVIEW_LIMIT = 1024 * 1024; // Не загружать гигантские текстовые файлы в DOM.
type AttachmentPreviewKind = 'pdf' | 'image' | 'text' | 'audio' | 'video';

/** Только заведомо поддерживаемые форматы; HTML и SVG не отображаем как активное содержимое. */
function previewFormat(item: AttachmentDto): { kind: AttachmentPreviewKind; mime: string } | null {
    const mime = (item.contentType ?? '').toLowerCase().split(';', 1)[0].trim();
    const extension = item.fileName.toLowerCase().split('.').pop() ?? '';
    const supported: Record<string, { kind: AttachmentPreviewKind; mime: string }> = {
        pdf: { kind: 'pdf', mime: 'application/pdf' },
        png: { kind: 'image', mime: 'image/png' },
        jpg: { kind: 'image', mime: 'image/jpeg' },
        jpeg: { kind: 'image', mime: 'image/jpeg' },
        gif: { kind: 'image', mime: 'image/gif' },
        webp: { kind: 'image', mime: 'image/webp' },
        txt: { kind: 'text', mime: 'text/plain' },
        log: { kind: 'text', mime: 'text/plain' },
        md: { kind: 'text', mime: 'text/plain' },
        csv: { kind: 'text', mime: 'text/plain' },
        json: { kind: 'text', mime: 'text/plain' },
        xml: { kind: 'text', mime: 'text/plain' },
        mp3: { kind: 'audio', mime: 'audio/mpeg' },
        wav: { kind: 'audio', mime: 'audio/wav' },
        ogg: { kind: 'audio', mime: 'audio/ogg' },
        mp4: { kind: 'video', mime: 'video/mp4' },
        webm: { kind: 'video', mime: 'video/webm' },
    };
    const format = supported[extension];
    if (!format) return null;
    // Не доверяем имени при явно несовместимом MIME. Octet-stream допустим как общий тип.
    if (mime && !['application/octet-stream', 'application/x-octet-stream', 'binary/octet-stream', 'application/download', 'application/x-download'].includes(mime) && mime !== format.mime) {
        const textCompatible = format.kind === 'text' &&
            (mime === 'text/plain' || mime === 'text/csv' || mime === 'application/json' ||
                mime === 'application/xml' || mime === 'text/xml' || mime === 'text/markdown');
        if (!textCompatible) return null;
    }
    return format;
}
let nextInputId = 0;

/**
 * Файлы записи `entityType`/`entityId`: список, скачивание, загрузка и удаление.
 * Видимость по грантам таблицы `entityType` — только для UI, права проверяет backend.
 */
@Component({
    selector: 'argent-attachments',
    standalone: true,
    imports: [DatePipe, TableModule, ButtonModule, ConfirmDialogModule, Dialog, TooltipModule],
    providers: [ConfirmationService],
    templateUrl: './attachments.component.html',
    styleUrl: './attachments.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttachmentsComponent {
    private readonly api = inject(AttachmentsApiService);
    private readonly auth = inject(AuthStore);
    private readonly confirm = inject(ConfirmationService);
    private readonly sanitizer = inject(DomSanitizer);
    private readonly messages = inject(MessageService);
    private listRequest?: Subscription;
    private previewRequest?: Subscription;
    private previewGeneration = 0;
    /** После уничтожения завершения upload/delete не перечитывают список. */
    private destroyed = false;
    /** Уникальный `id` скрытого `<input type="file">`. */
    readonly inputId = `argent-attachments-file-${nextInputId++}`;

    /** Таблица записи-владельца. */
    readonly entityType = input.required<string>();
    /** Идентификатор записи-владельца. */
    readonly entityId = input.required<string>();
    /** Только просмотр и скачивание, даже при гранте `write`. */
    readonly readonly = input(false);

    readonly items = signal<AttachmentDto[]>([]);
    readonly loading = signal(false);
    readonly uploading = signal(false);
    readonly error = signal('');
    /** Идентификаторы файлов, по которым идёт удаление. */
    readonly deletingIds = signal<ReadonlySet<string>>(new Set());
    readonly previewItem = signal<AttachmentDto | null>(null);
    readonly previewKind = signal<AttachmentPreviewKind | null>(null);
    readonly previewLoading = signal(false);
    readonly previewError = signal('');
    readonly previewUrl = signal<string | null>(null);
    readonly previewSafePdfUrl = signal<SafeResourceUrl | null>(null);
    readonly previewText = signal('');

    readonly canRead = computed(() => {
        // Явно читаем пользователя, чтобы состояние менялось после загрузки грантов.
        this.auth.user();
        return this.auth.canTable(this.entityType(), 'read');
    });
    readonly canWrite = computed(() => {
        this.auth.user();
        return !this.readonly() && this.auth.canTable(this.entityType(), 'write');
    });

    constructor() {
        effect(() => {
            const entityType = this.entityType();
            const entityId = this.entityId();
            const canRead = this.canRead();
            // untracked: load() пишет сигналы (loading, items) — они не должны стать зависимостями эффекта.
            untracked(() => {
                // При смене записи/прав не показываем файл предыдущего владельца.
                this.closePreview();
                if (canRead) {
                    this.load(entityType, entityId);
                } else {
                    this.listRequest?.unsubscribe();
                    this.items.set([]);
                    this.loading.set(false);
                }
            });
        });
        inject(DestroyRef).onDestroy(() => {
            this.destroyed = true;
            this.listRequest?.unsubscribe();
            this.closePreview();
        });
    }

    reload(): void {
        if (!this.destroyed && this.canRead()) {
            this.load(this.entityType(), this.entityId());
        }
    }

    /** Обработчик скрытого `<input type="file">`: загружает выбранные файлы и сбрасывает выбор. */
    onFilesSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const files = Array.from(input.files ?? []);
        input.value = '';
        this.uploadFiles(files);
    }

    /**
     * Загружает файлы по одному; ошибка одного файла показывается toast и не останавливает остальные.
     * После всех загрузок список перечитывается.
     */
    uploadFiles(files: File[]): void {
        if (files.length === 0 || !this.canWrite()) {
            return;
        }
        const entityType = this.entityType();
        const entityId = this.entityId();
        this.uploading.set(true);
        from(files).pipe(
            concatMap(file => this.api.upload(entityType, entityId, file).pipe(
                catchError(error => {
                    this.notifyError(error);
                    return EMPTY;
                }),
            )),
            finalize(() => {
                this.uploading.set(false);
                this.reload();
            }),
        ).subscribe();
    }

    /** Скачивает файл через `HttpClient` (с JWT) и сохраняет его под исходным именем. */
    download(item: AttachmentDto): void {
        this.api.download(item.id).subscribe({
            next: blob => downloadBlob(blob, item.fileName),
            error: error => this.notifyError(error),
        });
    }

    /** Предпросмотр не меняет полномочия: API проверяет право чтения вложения. */
    canPreview(item: AttachmentDto): boolean {
        return previewFormat(item) !== null;
    }

    /** Просмотр с авторизованной загрузкой Blob — без JWT и публичного URL файла. */
    showPreview(item: AttachmentDto): void {
        if (!this.canRead()) return;
        const format = previewFormat(item);
        if (!format) return;
        this.closePreview();
        const generation = this.previewGeneration;
        this.previewItem.set(item);
        this.previewKind.set(format.kind);
        if (format.kind === 'text' && item.sizeBytes > TEXT_PREVIEW_LIMIT) {
            this.previewError.set('Текстовый файл больше 1 МБ. Скачайте его для просмотра.');
            return;
        }
        this.previewLoading.set(true);
        this.previewRequest = this.api.download(item.id).subscribe({
            next: blob => {
                if (generation !== this.previewGeneration) return;
                if (format.kind === 'text') {
                    if (blob.size > TEXT_PREVIEW_LIMIT) {
                        this.previewError.set('Текстовый файл больше 1 МБ. Скачайте его для просмотра.');
                        this.previewLoading.set(false);
                        return;
                    }
                    blob.text().then(text => {
                        if (generation === this.previewGeneration) {
                            this.previewText.set(text);
                            this.previewLoading.set(false);
                        }
                    }).catch(() => {
                        if (generation === this.previewGeneration) {
                            this.previewError.set('Не удалось прочитать содержимое файла.');
                            this.previewLoading.set(false);
                        }
                    });
                } else {
                    // Принудительно задаём тип из белого списка (не доверяем Content-Type ответа).
                    const safeBlob = new Blob([blob], { type: format.mime });
                    const url = URL.createObjectURL(safeBlob);
                    this.previewUrl.set(url);
                    if (format.kind === 'pdf') {
                        this.previewSafePdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
                    }
                    this.previewLoading.set(false);
                }
            },
            error: error => {
                if (generation !== this.previewGeneration) return;
                this.previewError.set(problemMessage(error, 'Не удалось загрузить файл для просмотра'));
                this.previewLoading.set(false);
                this.notifyError(error);
            },
        });
    }

    /** Скачивание доступно даже если встроенный просмотр не поддерживается. */
    downloadPreview(): void {
        const item = this.previewItem();
        if (item) this.download(item);
    }

    closePreview(): void {
        this.previewGeneration++;
        this.previewRequest?.unsubscribe();
        this.previewRequest = undefined;
        const url = this.previewUrl();
        if (url) URL.revokeObjectURL(url);
        this.previewUrl.set(null);
        this.previewSafePdfUrl.set(null);
        this.previewText.set('');
        this.previewError.set('');
        this.previewLoading.set(false);
        this.previewKind.set(null);
        this.previewItem.set(null);
    }

    confirmDelete(item: AttachmentDto): void {
        this.confirm.confirm({
            header: 'Удаление файла',
            message: `Удалить файл «${item.fileName}»?`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Удалить',
            rejectLabel: 'Отмена',
            acceptButtonProps: { severity: 'danger' },
            rejectButtonProps: { severity: 'secondary' },
            accept: () => this.remove(item),
        });
    }

    isDeleting(item: AttachmentDto): boolean {
        return this.deletingIds().has(item.id);
    }

    /** Человекочитаемый размер: `500 Б`, `2,0 КБ`, `1,5 МБ`. */
    formatSize(bytes: number): string {
        const units = ['Б', 'КБ', 'МБ', 'ГБ'];
        let value = bytes;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        const text = unit === 0 ? String(value) : value.toFixed(1).replace('.', ',');
        return `${text} ${units[unit]}`;
    }

    private load(entityType: string, entityId: string): void {
        this.listRequest?.unsubscribe();
        this.loading.set(true);
        this.error.set('');
        this.listRequest = this.api.list(entityType, entityId).pipe(
            finalize(() => this.loading.set(false)),
        ).subscribe({
            next: items => this.items.set(items),
            error: error => {
                this.error.set(problemMessage(error, ERROR_FALLBACK));
                this.notifyError(error);
            },
        });
    }

    private remove(item: AttachmentDto): void {
        this.markDeleting(item.id, true);
        this.api.remove(item.id).pipe(
            finalize(() => this.markDeleting(item.id, false)),
        ).subscribe({
            next: () => this.reload(),
            error: error => this.notifyError(error),
        });
    }

    private markDeleting(id: string, deleting: boolean): void {
        this.deletingIds.update(ids => {
            const next = new Set(ids);
            if (deleting) next.add(id);
            else next.delete(id);
            return next;
        });
    }

    private notifyError(error: unknown): void {
        // На 401/403 toast уже показал errorInterceptor.
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
            return;
        }
        this.messages.add({
            key: 'argent',
            severity: 'error',
            summary: 'Вложения',
            detail: problemMessage(error, ERROR_FALLBACK),
        });
    }
}
