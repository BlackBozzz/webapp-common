import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provideArgentAudit } from '../config/audit.config';
import { AuditApiService } from './audit-api.service';

describe('AuditApiService', () => {
    let api: AuditApiService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        api = TestBed.inject(AuditApiService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('page sends GET /api/audit with params', () => {
        api.page({
            entityType: 'orders', entityId: '1', action: 'UPDATE',
            from: '2026-11-08T00:00:00Z', to: '2026-11-09T00:00:00Z', page: 2, size: 50,
        }).subscribe();

        const request = http.expectOne(r => r.url === '/api/audit');
        expect(request.request.method).toBe('GET');
        const params = request.request.params;
        expect(params.get('entityType')).toBe('orders');
        expect(params.get('entityId')).toBe('1');
        expect(params.get('action')).toBe('UPDATE');
        expect(params.get('from')).toBe('2026-11-08T00:00:00Z');
        expect(params.get('to')).toBe('2026-11-09T00:00:00Z');
        expect(params.get('page')).toBe('2');
        expect(params.get('size')).toBe('50');
        request.flush({ items: [], page: 2, size: 50, totalElements: 0, totalPages: 0, first: false, last: true });
    });

    it('page omits empty params', () => {
        api.page({ entityType: '', entityId: '  ', action: undefined, page: 0, size: 20 }).subscribe();

        const request = http.expectOne(r => r.url === '/api/audit');
        expect(request.request.params.keys().sort()).toEqual(['page', 'size']);
        request.flush({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0, first: true, last: true });
    });
});

describe('provideArgentAudit', () => {
    it('strips trailing slash from apiUrl', () => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting(), provideArgentAudit({ apiUrl: '/backend/audit/' })],
        });
        TestBed.inject(AuditApiService).page({}).subscribe();

        const http = TestBed.inject(HttpTestingController);
        http.expectOne(r => r.url === '/backend/audit').flush({ items: [] });
        http.verify();
    });
});
