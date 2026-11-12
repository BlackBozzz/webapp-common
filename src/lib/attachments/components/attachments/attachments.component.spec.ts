import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Confirmation, ConfirmationService, MessageService } from 'primeng/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../auth/service/auth.store';
import { TableOperation } from '../../../auth/dto/auth.dto';
import { AttachmentDto } from '../../dto/attachment.dto';
import { AttachmentsComponent } from './attachments.component';

const ITEMS: AttachmentDto[] = [
    {
        id: 'a1', entityType: 'orders', entityId: '1', fileName: 'договор.pdf', contentType: 'application/pdf',
        sizeBytes: 2048, uploadedLogin: 'ivan', createdAt: '2026-11-08T10:15:00Z',
    },
    {
        id: 'a2', entityType: 'orders', entityId: '1', fileName: 'фото.png', contentType: 'image/png',
        sizeBytes: 500, uploadedLogin: null, createdAt: '2026-11-08T11:00:00Z',
    },
];

const LIST_URL = '/api/attachments?entityType=orders&entityId=1';

describe('AttachmentsComponent', () => {
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [AttachmentsComponent],
            providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), MessageService],
        });
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    function grant(ops: TableOperation[]): void {
        TestBed.inject(AuthStore).user.set({
            id: '1',
            login: 'ivan',
            displayName: 'Иван',
            grants: { tables: { orders: ops }, actions: [] },
        });
    }

    function create(readonly = false): ComponentFixture<AttachmentsComponent> {
        const fixture = TestBed.createComponent(AttachmentsComponent);
        fixture.componentRef.setInput('entityType', 'orders');
        fixture.componentRef.setInput('entityId', '1');
        fixture.componentRef.setInput('readonly', readonly);
        fixture.detectChanges();
        return fixture;
    }

    function element(fixture: ComponentFixture<AttachmentsComponent>): HTMLElement {
        return fixture.nativeElement as HTMLElement;
    }

    function loadList(fixture: ComponentFixture<AttachmentsComponent>): void {
        http.expectOne(LIST_URL).flush(ITEMS);
        fixture.detectChanges();
    }

    it('renders list for reader', () => {
        grant(['read']);
        const fixture = create();
        loadList(fixture);

        const names = Array.from(element(fixture).querySelectorAll('.argent-attachments__name'))
            .map(node => node.textContent?.trim());
        expect(names).toEqual(['договор.pdf', 'фото.png']);
        expect(element(fixture).textContent).toContain('2,0 КБ');
        expect(element(fixture).textContent).toContain('500 Б');
    });

    it('hides upload and delete without write', () => {
        grant(['read']);
        const fixture = create();
        loadList(fixture);

        expect(element(fixture).querySelector('.argent-attachments__upload')).toBeNull();
        expect(element(fixture).querySelector('.argent-attachments__delete')).toBeNull();
    });

    it('hides upload and delete in readonly mode even with write', () => {
        grant(['read', 'write']);
        const fixture = create(true);
        loadList(fixture);

        expect(element(fixture).querySelector('.argent-attachments__upload')).toBeNull();
        expect(element(fixture).querySelector('.argent-attachments__delete')).toBeNull();
    });

    it('shows upload for writer and posts selected file', () => {
        grant(['read', 'write']);
        const fixture = create();
        loadList(fixture);

        expect(element(fixture).querySelector('.argent-attachments__upload')).not.toBeNull();
        expect(element(fixture).querySelectorAll('.argent-attachments__delete').length).toBe(2);

        const first = new File(['abc'], 'a.txt', { type: 'text/plain' });
        const second = new File(['def'], 'b.txt', { type: 'text/plain' });
        fixture.componentInstance.uploadFiles([first, second]);

        const upload1 = http.expectOne(r => r.method === 'POST' && r.url === '/api/attachments');
        expect(((upload1.request.body as FormData).get('file') as File).name).toBe('a.txt');
        expect((upload1.request.body as FormData).get('entityType')).toBe('orders');
        expect((upload1.request.body as FormData).get('entityId')).toBe('1');
        upload1.flush(ITEMS[0], { status: 201, statusText: 'Created' });

        const upload2 = http.expectOne(r => r.method === 'POST' && r.url === '/api/attachments');
        expect(((upload2.request.body as FormData).get('file') as File).name).toBe('b.txt');
        upload2.flush(ITEMS[1], { status: 201, statusText: 'Created' });

        http.expectOne(LIST_URL).flush(ITEMS);
    });

    it('continues uploading remaining files when one fails', () => {
        grant(['read', 'write']);
        const add = vi.spyOn(TestBed.inject(MessageService), 'add');
        const fixture = create();
        loadList(fixture);

        fixture.componentInstance.uploadFiles([new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]);

        const upload1 = http.expectOne(r => r.method === 'POST');
        upload1.flush({ detail: 'Файл слишком большой' }, { status: 400, statusText: 'Bad Request' });
        expect(add).toHaveBeenCalledWith(expect.objectContaining({ key: 'argent', detail: 'Файл слишком большой' }));

        const upload2 = http.expectOne(r => r.method === 'POST');
        expect(((upload2.request.body as FormData).get('file') as File).name).toBe('b.txt');
        upload2.flush(ITEMS[1], { status: 201, statusText: 'Created' });

        http.expectOne(LIST_URL).flush(ITEMS);
    });

    it('skips own toast on 403', () => {
        grant(['read']);
        const add = vi.spyOn(TestBed.inject(MessageService), 'add');
        const fixture = create();

        http.expectOne(LIST_URL).flush({ detail: 'Нет прав' }, { status: 403, statusText: 'Forbidden' });
        fixture.detectChanges();

        expect(add).not.toHaveBeenCalled();
    });

    it('skips own toast on 401', () => {
        grant(['read']);
        const add = vi.spyOn(TestBed.inject(MessageService), 'add');
        const fixture = create();

        http.expectOne(LIST_URL).flush({ detail: 'Нужен вход' }, { status: 401, statusText: 'Unauthorized' });
        fixture.detectChanges();

        expect(add).not.toHaveBeenCalled();
    });

    it('does not reload list after destroy when upload completes', () => {
        grant(['read', 'write']);
        const fixture = create();
        loadList(fixture);

        fixture.componentInstance.uploadFiles([new File(['a'], 'a.txt')]);
        const upload = http.expectOne(r => r.method === 'POST');
        fixture.destroy();
        upload.flush(ITEMS[0], { status: 201, statusText: 'Created' });

        http.expectNone(LIST_URL);
    });

    it('does not reload list after destroy when delete completes', () => {
        grant(['read', 'write']);
        const fixture = create();
        loadList(fixture);

        const confirm = fixture.debugElement.injector.get(ConfirmationService);
        let confirmation: Confirmation | undefined;
        vi.spyOn(confirm, 'confirm').mockImplementation(value => {
            confirmation = value;
            return confirm;
        });
        fixture.componentInstance.confirmDelete(ITEMS[0]);
        confirmation!.accept!();
        const request = http.expectOne('/api/attachments/a1');
        fixture.destroy();
        request.flush(null, { status: 204, statusText: 'No Content' });

        http.expectNone(LIST_URL);
    });

    it('gives the hidden file input id and name', () => {
        grant(['read', 'write']);
        const fixture = create();
        loadList(fixture);

        const input = element(fixture).querySelector<HTMLInputElement>('input[type=file]')!;
        expect(input.id).toBeTruthy();
        expect(input.name).toBe('attachments');
    });

    it('takes files from the hidden input change event', () => {
        grant(['read', 'write']);
        const fixture = create();
        loadList(fixture);

        const input = element(fixture).querySelector<HTMLInputElement>('input[type=file]')!;
        expect(input.multiple).toBe(true);
        const file = new File(['abc'], 'a.txt');
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        input.dispatchEvent(new Event('change'));

        const upload = http.expectOne(r => r.method === 'POST');
        expect(((upload.request.body as FormData).get('file') as File).name).toBe('a.txt');
        upload.flush(ITEMS[0], { status: 201, statusText: 'Created' });
        http.expectOne(LIST_URL).flush(ITEMS);
    });

    it('renders no-access state without read and makes no request', () => {
        grant(['write']);
        const fixture = create();

        http.expectNone(r => r.url.startsWith('/api/attachments'));
        expect(element(fixture).textContent).toContain('Нет доступа к файлам');
        expect(element(fixture).querySelector('p-table')).toBeNull();
    });

    it('deletes after confirmation', () => {
        grant(['read', 'write']);
        const fixture = create();
        loadList(fixture);

        const confirm = fixture.debugElement.injector.get(ConfirmationService);
        let confirmation: Confirmation | undefined;
        vi.spyOn(confirm, 'confirm').mockImplementation(value => {
            confirmation = value;
            return confirm;
        });

        element(fixture).querySelector<HTMLButtonElement>('.argent-attachments__delete')!.click();
        expect(confirmation).toBeDefined();
        http.expectNone(r => r.method === 'DELETE');

        confirmation!.accept!();
        const request = http.expectOne('/api/attachments/a1');
        expect(request.request.method).toBe('DELETE');
        request.flush(null, { status: 204, statusText: 'No Content' });

        http.expectOne(LIST_URL).flush([ITEMS[1]]);
    });

    it('downloads file via blob link', async () => {
        grant(['read']);
        const fixture = create();
        loadList(fixture);

        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        const createUrl = vi.fn(() => 'blob:test');
        const revokeUrl = vi.fn();
        URL.createObjectURL = createUrl;
        URL.revokeObjectURL = revokeUrl;
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        try {
            element(fixture).querySelector<HTMLButtonElement>('.argent-attachments__download')!.click();
            const request = http.expectOne('/api/attachments/a1');
            expect(request.request.responseType).toBe('blob');
            request.flush(new Blob(['pdf']));

            expect(createUrl).toHaveBeenCalled();
            const anchor = click.mock.contexts[0] as HTMLAnchorElement;
            expect(anchor.download).toBe('договор.pdf');
            expect(anchor.href).toBe('blob:test');
            expect(revokeUrl).not.toHaveBeenCalled();
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(revokeUrl).toHaveBeenCalledWith('blob:test');
        } finally {
            click.mockRestore();
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
        }
    });

    it('shows toast on load error', () => {
        grant(['read']);
        const add = vi.spyOn(TestBed.inject(MessageService), 'add');
        const fixture = create();

        http.expectOne(LIST_URL).flush({ detail: 'Сломалось' }, { status: 500, statusText: 'Error' });
        fixture.detectChanges();

        expect(add).toHaveBeenCalledWith(expect.objectContaining({
            key: 'argent', severity: 'error', summary: 'Вложения', detail: 'Сломалось',
        }));
    });
    it('offers preview only for safe formats, excluding SVG and HTML', () => {
        grant(['read']);
        const fixture = create();
        loadList(fixture);
        expect(fixture.componentInstance.canPreview(ITEMS[0])).toBe(true);
        expect(fixture.componentInstance.canPreview(ITEMS[1])).toBe(true);
        expect(fixture.componentInstance.canPreview({ ...ITEMS[0], fileName: 'page.html', contentType: 'text/html' })).toBe(false);
        expect(fixture.componentInstance.canPreview({ ...ITEMS[0], fileName: 'image.svg', contentType: 'image/svg+xml' })).toBe(false);
        expect(fixture.componentInstance.canPreview({ ...ITEMS[0], fileName: 'report.docx', contentType: 'application/octet-stream' })).toBe(false);
        expect(element(fixture).querySelectorAll('.argent-attachments__preview').length).toBe(2);
        expect(element(fixture).querySelector<HTMLButtonElement>('.argent-attachments__preview')!.disabled).toBe(false);
        expect(element(fixture).querySelectorAll('.argent-attachments__download').length).toBe(2);
    });

    it('keeps the preview button visible but disabled for unsupported formats', () => {
        grant(['read']);
        const fixture = create();
        http.expectOne(LIST_URL).flush([{ ...ITEMS[0], fileName: 'document.docx', contentType: 'application/octet-stream' }]);
        fixture.detectChanges();
        const preview = element(fixture).querySelector<HTMLButtonElement>('.argent-attachments__preview')!;
        const download = element(fixture).querySelector<HTMLButtonElement>('.argent-attachments__download')!;
        expect(preview).toBeTruthy();
        expect(preview.disabled).toBe(true);
        expect(download.disabled).toBe(false);
    });

    it('loads text for preview through authenticated attachment API', async () => {
        grant(['read']);
        const fixture = create();
        loadList(fixture);
        const textFile = { ...ITEMS[0], fileName: 'notes.txt', contentType: 'text/plain' };
        fixture.componentInstance.showPreview(textFile);
        expect(fixture.componentInstance.previewLoading()).toBe(true);
        const request = http.expectOne('/api/attachments/a1');
        expect(request.request.responseType).toBe('blob');
        request.flush(new Blob(['Пример текста'], { type: 'text/plain' }));
        await Promise.resolve();
        expect(fixture.componentInstance.previewText()).toBe('Пример текста');
        expect(fixture.componentInstance.previewLoading()).toBe(false);
        fixture.componentInstance.closePreview();
        expect(fixture.componentInstance.previewItem()).toBe(null);
    });

    it('invalidates an in-progress preview when dialog closes', () => {
        grant(['read']);
        const fixture = create();
        loadList(fixture);
        fixture.componentInstance.showPreview(ITEMS[0]);
        const request = http.expectOne('/api/attachments/a1');
        fixture.componentInstance.closePreview();
        expect(request.cancelled).toBe(true);
        expect(fixture.componentInstance.previewItem()).toBe(null);
    });

    it('disables preview for a file with mismatched MIME type', () => {
        grant(['read']);
        const fixture = create();
        loadList(fixture);
        expect(fixture.componentInstance.canPreview({ ...ITEMS[0], contentType: 'text/html' })).toBe(false);
    });

});
