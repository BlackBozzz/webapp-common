import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ButtonDirective } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

/** Диалог просмотра бинарного значения. Декодирование выполняем только по запросу пользователя. */
@Component({
    selector: 'argent-table-binary-preview',
    standalone: true,
    imports: [ButtonDirective, DialogModule],
    templateUrl: './argent-table-binary-preview.component.html',
    styleUrl: './argent-table-binary-preview.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArgentTableBinaryPreviewComponent implements OnDestroy {
    @Input() set visible(value: boolean) {
        if (value && !this._visible) this.preparePreview();
        if (!value && this._visible) this.releasePreview();
        this._visible = value;
    }
    @Input() value: unknown;

    @Output() visibleChange = new EventEmitter<boolean>();

    private readonly sanitizer = inject(DomSanitizer);
    private _visible = false;
    private objectUrl: string | null = null;
    private fileBlob: Blob | null = null;

    get visible(): boolean {
        return this._visible;
    }

    fileName = 'вложение.bin';
    fileSize = '';
    mimeType = '';
    previewUrl: string | null = null;
    pdfUrl: SafeResourceUrl | null = null;
    error = '';

    close(): void {
        this.visibleChange.emit(false);
    }

    ngOnDestroy(): void {
        this.releasePreview();
    }

    download(): void {
        if (!this.objectUrl || !this.fileBlob) return;
        const anchor = document.createElement('a');
        anchor.href = this.objectUrl;
        anchor.download = this.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    private preparePreview(): void {
        this.releasePreview();
        this.error = '';
        this.fileName = 'вложение.bin';
        this.fileSize = '';
        this.mimeType = '';

        try {
            let raw: unknown = this.value;
            let hint = '';
            if (raw && typeof raw === 'object' && !(raw instanceof Blob) && !Array.isArray(raw) && !(raw instanceof Uint8Array)) {
                const record = raw as Record<string, unknown>;
                this.fileName = typeof record['fileName'] === 'string' ? record['fileName']
                    : typeof record['name'] === 'string' ? record['name'] : this.fileName;
                hint = typeof record['contentType'] === 'string' ? record['contentType']
                    : typeof record['mimeType'] === 'string' ? record['mimeType'] : '';
                raw = record['bytes'] ?? record['content'] ?? record['base64'] ?? record['data'];
            }

            if (raw instanceof Blob) {
                this.fileBlob = raw;
            } else {
                const bytes = this.readBytes(raw);
                if (!bytes) {
                    this.error = 'Не удалось распознать содержимое бинарного поля.';
                    return;
                }
                const type = hint || this.detectType(bytes);
                this.fileBlob = new Blob([bytes.slice().buffer], { type });
            }

            this.mimeType = this.fileBlob.type || 'application/octet-stream';
            this.fileSize = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
                .format(this.fileBlob.size / 1024) + ' КБ';
            this.objectUrl = URL.createObjectURL(this.fileBlob);
            if (this.mimeType.startsWith('image/')) this.previewUrl = this.objectUrl;
            if (this.mimeType === 'application/pdf') {
                // Используем только локальный blob:-адрес, созданный из данных записи.
                this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl);
            }
        } catch {
            this.error = 'Не удалось подготовить файл для просмотра.';
        }
    }

    private readBytes(raw: unknown): Uint8Array | null {
        if (raw instanceof Uint8Array) return raw;
        if (Array.isArray(raw)) {
            if (raw.length > 32 * 1024 * 1024) throw new Error('Файл слишком большой');
            if (!raw.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) return null;
            return Uint8Array.from(raw);
        }
        if (typeof raw !== 'string') return null;
        const normalized = raw.includes(';base64,') ? raw.slice(raw.indexOf(';base64,') + 8) : raw;
        const base64 = normalized.replace(/\s/g, '');
        if (!base64 || base64.length > 44 * 1024 * 1024) throw new Error('Файл слишком большой');
        const decoded = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(decoded.length);
        for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
        return bytes;
    }

    private detectType(bytes: Uint8Array): string {
        if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
        if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
        if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
        if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
        if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x57) return 'image/webp';
        return 'application/octet-stream';
    }

    private releasePreview(): void {
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
        this.fileBlob = null;
        this.previewUrl = null;
        this.pdfUrl = null;
    }
}
