import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthStore } from '../service/auth.store';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
    let http: HttpClient;
    let controller: HttpTestingController;

    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({
            providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
        });
        http = TestBed.inject(HttpClient);
        controller = TestBed.inject(HttpTestingController);
        TestBed.inject(AuthStore).setToken('t');
    });

    afterEach(() => {
        controller.verify();
        localStorage.clear();
    });

    it('adds Bearer to relative API request', () => {
        http.get('/api/x').subscribe();
        const req = controller.expectOne('/api/x');
        expect(req.request.headers.get('Authorization')).toBe('Bearer t');
        req.flush({});
    });

    it('does not add Bearer to external URL', () => {
        http.get('https://example.com/api/x').subscribe();
        const req = controller.expectOne('https://example.com/api/x');
        expect(req.request.headers.has('Authorization')).toBe(false);
        req.flush({});
    });

    it('does not add Bearer to login/config endpoints', () => {
        for (const url of ['/api/auth/login', '/api/auth/register', '/api/auth/config?x=1']) {
            http.get(url).subscribe();
            const req = controller.expectOne(url);
            expect(req.request.headers.has('Authorization')).toBe(false);
            req.flush({});
        }
    });
});
