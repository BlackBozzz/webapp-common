import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_TOKEN_STORAGE_KEY, AuthStore } from '../service/auth.store';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
    let http: HttpClient;
    let controller: HttpTestingController;
    let store: AuthStore;
    let router: Router;
    let messages: MessageService;

    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({
            providers: [
                provideRouter([]),
                provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
                provideHttpClientTesting(),
                MessageService,
            ],
        });
        http = TestBed.inject(HttpClient);
        controller = TestBed.inject(HttpTestingController);
        store = TestBed.inject(AuthStore);
        router = TestBed.inject(Router);
        messages = TestBed.inject(MessageService);
        store.setToken('t');
    });

    afterEach(() => {
        controller.verify();
        localStorage.clear();
    });

    it('adds Bearer header', () => {
        http.get('/api/x').subscribe();

        const req = controller.expectOne('/api/x');
        expect(req.request.headers.get('Authorization')).toBe('Bearer t');
        req.flush({});
    });

    it('clears token and navigates on 401', () => {
        const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
        const errors: unknown[] = [];

        http.get('/api/x').subscribe({ error: (e: unknown) => errors.push(e) });
        controller
            .expectOne('/api/x')
            .flush({ title: 'Unauthorized', status: 401 }, { status: 401, statusText: 'Unauthorized' });

        expect(store.token()).toBeNull();
        expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
        expect(navigate).toHaveBeenCalledWith('/login?returnUrl=%2F');
        expect(errors).toHaveLength(1);
    });

    it('clears token but does not navigate on 401 when already on login page', () => {
        vi.spyOn(router, 'url', 'get').mockReturnValue('/login?returnUrl=%2Fadmin');
        const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
        const errors: unknown[] = [];

        http.get('/api/auth/me').subscribe({ error: (e: unknown) => errors.push(e) });
        controller
            .expectOne('/api/auth/me')
            .flush({ title: 'Unauthorized', status: 401 }, { status: 401, statusText: 'Unauthorized' });

        expect(store.token()).toBeNull();
        expect(navigate).not.toHaveBeenCalled();
        expect(errors).toHaveLength(1);
    });

    it('keeps token on 401 from login endpoint', () => {
        const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
        const errors: unknown[] = [];

        http.post('/api/auth/login', { login: 'a' }).subscribe({
            error: (e: unknown) => errors.push(e),
        });
        controller
            .expectOne('/api/auth/login')
            .flush(
                { title: 'Unauthorized', status: 401, detail: 'Неверный логин или пароль' },
                { status: 401, statusText: 'Unauthorized' },
            );

        expect(store.token()).toBe('t');
        expect(navigate).not.toHaveBeenCalled();
        expect(errors).toHaveLength(1);
    });

    it('adds toast on 403', () => {
        const add = vi.spyOn(messages, 'add');
        const errors: unknown[] = [];

        http.get('/api/x').subscribe({ error: (e: unknown) => errors.push(e) });
        controller
            .expectOne('/api/x')
            .flush(
                { title: 'Forbidden', status: 403, detail: 'Нет доступа к таблице' },
                { status: 403, statusText: 'Forbidden' },
            );

        expect(add).toHaveBeenCalledWith({
            key: 'argent',
            severity: 'warn',
            summary: 'Недостаточно прав',
            detail: 'Нет доступа к таблице',
        });
        expect(store.token()).toBe('t');
        expect(errors).toHaveLength(1);
    });
});
