import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DictionaryTransferApiService } from './dictionary-transfer-api.service';

describe('DictionaryTransferApiService', () => {
    let api: DictionaryTransferApiService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        api = TestBed.inject(DictionaryTransferApiService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('export sends GET with format, search and sort and observes blob response', () => {
        api.export('dict_a', 'xlsx', { search: 'abc', sort: 'name,asc' }).subscribe();

        const request = http.expectOne(r => r.url === '/api/export/dictionaries/dict_a');
        expect(request.request.method).toBe('GET');
        expect(request.request.params.get('format')).toBe('xlsx');
        expect(request.request.params.get('search')).toBe('abc');
        expect(request.request.params.get('sort')).toBe('name,asc');
        expect(request.request.responseType).toBe('blob');
        request.flush(new Blob(['x']));
    });

    it('export omits empty search and sort', () => {
        api.export('dict_a', 'csv', {}).subscribe();

        const request = http.expectOne(r => r.url === '/api/export/dictionaries/dict_a');
        expect(request.request.params.keys()).toEqual(['format']);
        request.flush(new Blob(['x']));
    });

    it('import posts FormData with file and mode', () => {
        const file = new File(['a;b'], 'data.csv', { type: 'text/csv' });
        let total = -1;
        api.import('dict_a', file, 'REPLACE').subscribe(report => total = report.total);

        const request = http.expectOne('/api/import/dictionaries/dict_a');
        expect(request.request.method).toBe('POST');
        const body = request.request.body as FormData;
        expect(body).toBeInstanceOf(FormData);
        expect((body.get('file') as File).name).toBe('data.csv');
        expect(body.get('mode')).toBe('REPLACE');
        request.flush({ total: 3, created: 3, updated: 0, failed: 0, errors: [] });
        expect(total).toBe(3);
    });
});
