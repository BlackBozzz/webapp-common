import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provideArgentAttachments } from '../config/attachments.config';
import { AttachmentsApiService } from './attachments-api.service';

describe('AttachmentsApiService', () => {
    let api: AttachmentsApiService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        api = TestBed.inject(AttachmentsApiService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('list sends GET with entityType and entityId params', () => {
        api.list('orders', '1').subscribe();

        const request = http.expectOne(r => r.url === '/api/attachments');
        expect(request.request.method).toBe('GET');
        expect(request.request.params.get('entityType')).toBe('orders');
        expect(request.request.params.get('entityId')).toBe('1');
        request.flush([]);
    });

    it('upload posts FormData with entityType, entityId and file', () => {
        const file = new File(['abc'], 'a.txt', { type: 'text/plain' });
        api.upload('orders', '1', file).subscribe();

        const request = http.expectOne('/api/attachments');
        expect(request.request.method).toBe('POST');
        const body = request.request.body as FormData;
        expect(body).toBeInstanceOf(FormData);
        expect(body.get('entityType')).toBe('orders');
        expect(body.get('entityId')).toBe('1');
        expect((body.get('file') as File).name).toBe('a.txt');
        request.flush({});
    });

    it('download requests blob', () => {
        api.download('42').subscribe();

        const request = http.expectOne('/api/attachments/42');
        expect(request.request.method).toBe('GET');
        expect(request.request.responseType).toBe('blob');
        request.flush(new Blob(['x']));
    });

    it('remove sends DELETE', () => {
        api.remove('42').subscribe();

        const request = http.expectOne('/api/attachments/42');
        expect(request.request.method).toBe('DELETE');
        request.flush(null, { status: 204, statusText: 'No Content' });
    });
});

describe('provideArgentAttachments', () => {
    it('strips trailing slash from apiUrl', () => {
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                provideArgentAttachments({ apiUrl: '/backend/files/' }),
            ],
        });
        TestBed.inject(AttachmentsApiService).list('orders', '1').subscribe();

        const http = TestBed.inject(HttpTestingController);
        http.expectOne(r => r.url === '/backend/files').flush([]);
        http.verify();
    });
});
