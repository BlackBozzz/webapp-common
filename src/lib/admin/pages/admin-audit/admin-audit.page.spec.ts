import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdminAuditPage } from './admin-audit.page';

const EMPTY_PAGE = { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0, first: true, last: true };

describe('AdminAuditPage', () => {
    let http: HttpTestingController;
    let fixture: ComponentFixture<AdminAuditPage>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [AdminAuditPage],
            providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), MessageService],
        });
        http = TestBed.inject(HttpTestingController);
        fixture = TestBed.createComponent(AdminAuditPage);
        fixture.detectChanges();
        http.expectOne('/api/argent-dictionary').flush([{ code: 'orders', name: 'Заказы' }]);
        fixture.detectChanges();
    });

    afterEach(() => http.verify());

    it('requests all tables when none selected', () => {
        const request = http.expectOne(r => r.url === '/api/audit');
        expect(request.request.params.has('entityType')).toBe(false);
        expect(request.request.params.get('page')).toBe('0');
        expect(request.request.params.get('size')).toBe('20');
        request.flush(EMPTY_PAGE);
        fixture.detectChanges();

        expect(fixture.componentInstance['tableOptions']()).toEqual([
            { label: 'Все таблицы', value: '' },
            { label: 'Заказы (orders)', value: 'orders' },
        ]);
    });

    it('passes filters', () => {
        http.expectOne(r => r.url === '/api/audit').flush(EMPTY_PAGE);
        const page = fixture.componentInstance;
        page['entityType'].set('orders');
        page['entityId'].set(' 42 ');
        page['action'].set('UPDATE');
        page['fromDate'].set(new Date(2026, 10, 1));
        page['toDate'].set(new Date(2026, 10, 8));
        page['apply']();

        const request = http.expectOne(r => r.url === '/api/audit');
        const params = request.request.params;
        expect(params.get('entityType')).toBe('orders');
        expect(params.get('entityId')).toBe('42');
        expect(params.get('action')).toBe('UPDATE');
        expect(params.get('from')).toBe(new Date(2026, 10, 1).toISOString());
        // `to` на backend исключителен: берём начало следующего дня, чтобы выбранный день вошёл целиком.
        expect(params.get('to')).toBe(new Date(2026, 10, 9).toISOString());
        expect(params.get('page')).toBe('0');
        request.flush(EMPTY_PAGE);
    });

    it('ignores invalid date and swaps reversed period', () => {
        http.expectOne(r => r.url === '/api/audit').flush(EMPTY_PAGE);
        const page = fixture.componentInstance;
        page['fromDate'].set(new Date('не дата'));
        page['toDate'].set(new Date(2026, 10, 8));
        page['apply']();

        let params = http.expectOne(r => r.url === '/api/audit').request.params;
        expect(params.has('from')).toBe(false);
        expect(params.get('to')).toBe(new Date(2026, 10, 9).toISOString());

        page['fromDate'].set(new Date(2026, 10, 8));
        page['toDate'].set(new Date(2026, 10, 1));
        page['apply']();

        params = http.expectOne(r => r.url === '/api/audit').request.params;
        expect(params.get('from')).toBe(new Date(2026, 10, 1).toISOString());
        expect(params.get('to')).toBe(new Date(2026, 10, 9).toISOString());
    });

    it('refresh keeps current page', () => {
        http.expectOne(r => r.url === '/api/audit').flush(EMPTY_PAGE);
        const page = fixture.componentInstance;
        page['paginate']({ page: 3, size: 50 });
        http.expectOne(r => r.url === '/api/audit').flush({ ...EMPTY_PAGE, page: 3, size: 50 });

        page['refresh']();
        const params = http.expectOne(r => r.url === '/api/audit').request.params;
        expect(params.get('page')).toBe('3');
        expect(params.get('size')).toBe('50');
    });

    it('treats «Все таблицы» as no entityType', () => {
        http.expectOne(r => r.url === '/api/audit').flush(EMPTY_PAGE);
        const page = fixture.componentInstance;
        page['entityType'].set('orders');
        page['apply']();
        http.expectOne(r => r.url === '/api/audit').flush(EMPTY_PAGE);

        page['reset']();
        const request = http.expectOne(r => r.url === '/api/audit');
        expect(request.request.params.has('entityType')).toBe(false);
        request.flush(EMPTY_PAGE);
    });
});
