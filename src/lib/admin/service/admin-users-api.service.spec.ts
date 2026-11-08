import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdminUsersApiService } from './admin-users-api.service';

describe('AdminUsersApiService', () => {
    let api: AdminUsersApiService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        api = TestBed.inject(AdminUsersApiService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('list passes search and paging params', () => {
        api.list({ search: 'ivan', page: 2, size: 50 }).subscribe();

        const request = http.expectOne(r => r.url === '/api/users');
        expect(request.request.method).toBe('GET');
        expect(request.request.params.get('search')).toBe('ivan');
        expect(request.request.params.get('page')).toBe('2');
        expect(request.request.params.get('size')).toBe('50');
        request.flush({ items: [], page: 2, size: 50, totalElements: 0, totalPages: 0, first: false, last: true });
    });

    it('list omits empty search', () => {
        api.list({ search: '', page: 0, size: 20 }).subscribe();

        const request = http.expectOne(r => r.url === '/api/users');
        expect(request.request.params.has('search')).toBe(false);
        request.flush({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0, first: true, last: true });
    });

    it('setRoles posts roleCodes', () => {
        api.setRoles('7', ['READER', 'EDITOR']).subscribe();

        const request = http.expectOne('/api/users/7/roles');
        expect(request.request.method).toBe('PUT');
        expect(request.request.body).toEqual({ roleCodes: ['READER', 'EDITOR'] });
        request.flush({});
    });
});
