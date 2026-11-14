import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';
import { ArgentEntitySelectComponent, argentEntityPage, argentEntityPath } from './argent-entity-select.component';

describe('ArgentEntitySelectComponent', () => {
    it('reads nested labels and different server page shapes', () => {
        expect(argentEntityPath({ profile: { fullName: 'Иван' } }, 'profile.fullName')).toBe('Иван');
        expect(argentEntityPage({ content: [1], last: false })).toEqual({ records: [1], hasMore: true });
        expect(argentEntityPage({ items: [1, 2], page: 0, totalPages: 1 })).toEqual({ records: [1, 2], hasMore: false });
        expect(argentEntityPage([1, 2])).toEqual({ records: [1, 2], hasMore: false });
    });

    it('resolves an existing value to a label without changing the saved ID', () => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        const fixture = TestBed.createComponent(ArgentEntitySelectComponent);
        const component = fixture.componentInstance;
        component.endpoint = '/api/employees';
        component.labelField = 'profile.fullName';
        const outgoing: unknown[] = [];
        component.registerOnChange(value => outgoing.push(value));
        component.writeValue('u-1');
        const http = TestBed.inject(HttpTestingController);
        http.expectOne('/api/employees/u-1').flush({ id: 'u-1', profile: { fullName: 'Анна' } });
        expect(component.selected()).toEqual({ id: 'u-1', label: 'Анна' });
        expect(outgoing).toEqual([]);
        component.choose({ id: 'u-2', label: 'Мария' });
        expect(outgoing).toEqual(['u-2']);
        http.verify();
    });

    it('searches on the server with page params and returns multiple IDs', () => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        const fixture = TestBed.createComponent(ArgentEntitySelectComponent);
        const component = fixture.componentInstance;
        component.endpoint = '/api/employees';
        component.multiple = true;
        component.search({ query: 'Иван' });
        const http = TestBed.inject(HttpTestingController);
        const request = http.expectOne(r => r.url === '/api/employees');
        expect(request.request.params.get('search')).toBe('Иван');
        expect(request.request.params.get('page')).toBe('0');
        request.flush({ content: [{ id: 7, name: 'Иван' }], last: true });
        expect(component.suggestions()).toEqual([{ id: 7, label: 'Иван' }]);
        let value: unknown;
        component.registerOnChange(next => value = next);
        component.choose([{ id: 7, label: 'Иван' }]);
        expect(value).toEqual([7]);
        http.verify();
    });
});
