import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
    ActivatedRouteSnapshot,
    provideRouter,
    Router,
    RouterStateSnapshot,
    UrlTree,
} from '@angular/router';
import { firstValueFrom, isObservable, Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthStore } from '../service/auth.store';
import { actionGuard, authGuard } from './auth.guard';

const route = {} as ActivatedRouteSnapshot;
const state = (url: string) => ({ url }) as RouterStateSnapshot;

describe('auth guards', () => {
    let router: Router;
    let store: AuthStore;

    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({
            providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
        });
        router = TestBed.inject(Router);
        store = TestBed.inject(AuthStore);
    });

    afterEach(() => localStorage.clear());

    it('actionGuard redirects to /admin without action', () => {
        store.setToken('t');
        store.user.set({ id: '1', login: 'u', displayName: 'U', grants: { tables: {}, actions: [] } });

        const result = TestBed.runInInjectionContext(() =>
            actionGuard('admin')(route, state('/admin/users')),
        );

        expect(result).toBeInstanceOf(UrlTree);
        expect(router.serializeUrl(result as UrlTree)).toBe('/admin');
    });

    it('actionGuard allows granted action', () => {
        store.user.set({
            id: '1',
            login: 'u',
            displayName: 'U',
            grants: { tables: {}, actions: ['admin'] },
        });

        const result = TestBed.runInInjectionContext(() =>
            actionGuard('admin')(route, state('/admin/users')),
        );

        expect(result).toBe(true);
    });

    it('authGuard redirects to /login with returnUrl when no token', () => {
        const result = TestBed.runInInjectionContext(() =>
            authGuard(route, state('/admin/dictionaries')),
        );

        expect(result).toBeInstanceOf(UrlTree);
        expect(router.serializeUrl(result as UrlTree)).toBe(
            '/login?returnUrl=%2Fadmin%2Fdictionaries',
        );
    });

    it('authGuard loads user when token present and user missing', async () => {
        store.setToken('t');
        const http = TestBed.inject(HttpTestingController);

        const result = TestBed.runInInjectionContext(() => authGuard(route, state('/admin')));
        expect(isObservable(result)).toBe(true);
        const pending = firstValueFrom(result as Observable<boolean | UrlTree>);
        http.expectOne('/api/auth/me').flush({
            id: '1',
            login: 'u',
            displayName: 'U',
            grants: { tables: {}, actions: [] },
        });

        expect(await pending).toBe(true);
        expect(store.user()?.login).toBe('u');
    });

    it('authGuard redirects to login when loading user fails', async () => {
        store.setToken('t');
        const http = TestBed.inject(HttpTestingController);

        const result = TestBed.runInInjectionContext(() => authGuard(route, state('/admin')));
        const pending = firstValueFrom(result as Observable<boolean | UrlTree>);
        http.expectOne('/api/auth/me').flush(null, { status: 500, statusText: 'Error' });

        const tree = await pending;
        expect(tree).toBeInstanceOf(UrlTree);
        expect(router.serializeUrl(tree as UrlTree)).toBe('/login?returnUrl=%2Fadmin');
    });
});
