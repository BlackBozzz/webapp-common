import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
    ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
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
let nextInputId = 0;

/**
 * Файлы записи `entityType`/`entityId`: список, скачивание, загрузка и удаление.
 * Видимость по грантам таблицы `entityType` — только для UI, права проверяет backend.
 */
@Component({
    selector: 'argent-attachments',
    standalone: true,
    imports: [DatePipe, TableModule, ButtonModule, ConfirmDialogModule, TooltipModule],
    providers: [ConfirmationService],
    templateUrl: './attachments.component.html',
    styleUrl: './attachments.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttachmentsComponent {
    private readonly api = inject(AttachmentsApiService);
    private readonly auth = inject(AuthStore);
    private readonly confirm = inject(ConfirmationService);
    private readonly messages = inject(MessageService);
    private listRequest?: Subscription;
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
