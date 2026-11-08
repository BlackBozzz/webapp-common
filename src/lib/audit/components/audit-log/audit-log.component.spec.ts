import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../auth/service/auth.store';
import { TableOperation } from '../../../auth/dto/auth.dto';
import { DynamicPage } from '../../../dictionary/dynamic/dto/dynamic-dictionary.dto';
import { AuditEntryDto } from '../../dto/audit.dto';
import { AuditLogComponent } from './audit-log.component';

const PAGE: DynamicPage<AuditEntryDto> = {
    items: [
        {
            id: 'e1', entityType: 'orders', entityId: '1', action: 'UPDATE', field: 'title',
            oldValue: 'Старое', newValue: 'Новое', actorId: 'u1', actorLogin: 'ivan', createdAt: '2026-11-08T10:15:00Z',
        },
        {
            id: 'e2', entityType: 'orders', entityId: '1', action: 'INSERT', field: null,
            oldValue: null, newValue: null, actorId: null, actorLogin: null, createdAt: '2026-11-08T09:00:00Z',
        },
    ],
    page: 0, size: 20, totalElements: 2, totalPages: 1, first: true, last: true,
};

const LIST_URL = '/api/audit?entityType=orders&entityId=1&page=0&size=20';

describe('AuditLogComponent', () => {
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [AuditLogComponent],
            providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), MessageService],
        });
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    function grant(ops: TableOperation[], actions: string[] = []): void {
        TestBed.inject(AuthStore).user.set({
            id: '1', login: 'ivan', displayName: 'Иван',
            grants: { tables: { orders: ops }, actions },
        });
    }

    function create(): ComponentFixture<AuditLogComponent> {
        const fixture = TestBed.createComponent(AuditLogComponent);
        fixture.componentRef.setInput('entityType', 'orders');
        fixture.componentRef.setInput('entityId', '1');
        fixture.detectChanges();
        return fixture;
    }

    function element(fixture: ComponentFixture<AuditLogComponent>): HTMLElement {
        return fixture.nativeElement as HTMLElement;
    }

    it('renders entries for reader', () => {
        grant(['read']);
        const fixture = create();
        http.expectOne(LIST_URL).flush(PAGE);
        fixture.detectChanges();

        expect(element(fixture).querySelectorAll('.argent-audit-table__row').length).toBe(2);
        const text = element(fixture).textContent ?? '';
        expect(text).toContain('ivan');
        expect(text).toContain('title');
        expect(text).toContain('Старое');
        expect(text).toContain('Новое');
        expect(text).toContain('Изменение');
        expect(text).toContain('Создание');
    });

    it('hidden without read', () => {
        grant(['write']);
        const fixture = create();

        http.expectNone(r => r.url.startsWith('/api/audit'));
        expect(element(fixture).textContent).toContain('Нет доступа к истории');
        expect(element(fixture).querySelector('p-table')).toBeNull();
    });

    it('admin sees without table grant', () => {
        grant([], ['admin']);
        const fixture = create();
        http.expectOne(LIST_URL).flush(PAGE);
        fixture.detectChanges();

        expect(element(fixture).textContent).not.toContain('Нет доступа к истории');
        expect(element(fixture).querySelectorAll('.argent-audit-table__row').length).toBe(2);
    });

    it('loads requested page on paginate', () => {
        grant(['read']);
        const fixture = create();
        http.expectOne(LIST_URL).flush({ ...PAGE, totalElements: 45, totalPages: 3 });
        fixture.detectChanges();

        fixture.componentInstance.onLazyLoad({ page: 2, size: 20 });
        http.expectOne('/api/audit?entityType=orders&entityId=1&page=2&size=20').flush({ ...PAGE, page: 2 });
    });

    it('shows toast on load error but not on 403', () => {
        grant(['read']);
        const add = vi.spyOn(TestBed.inject(MessageService), 'add');
        const fixture = create();
        http.expectOne(LIST_URL).flush({ detail: 'Сломалось' }, { status: 500, statusText: 'Error' });
        expect(add).toHaveBeenCalledWith(expect.objectContaining({ key: 'argent', severity: 'error', detail: 'Сломалось' }));

        add.mockClear();
        fixture.componentInstance.reload();
        http.expectOne(LIST_URL).flush({ detail: 'Нет прав' }, { status: 403, statusText: 'Forbidden' });
        expect(add).not.toHaveBeenCalled();
    });

    it('skips own toast on 401', () => {
        grant(['read']);
        const add = vi.spyOn(TestBed.inject(MessageService), 'add');
        create();
        http.expectOne(LIST_URL).flush({ detail: 'Нужен вход' }, { status: 401, statusText: 'Unauthorized' });
        expect(add).not.toHaveBeenCalled();
    });
});
