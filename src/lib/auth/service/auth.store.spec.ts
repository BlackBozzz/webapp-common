import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CurrentUser } from '../dto/auth.dto';
import { AuthStore, AUTH_TOKEN_STORAGE_KEY } from './auth.store';

function user(tables: Record<string, string[]>, actions: string[] = []): CurrentUser {
    return { id: '1', login: 'u', displayName: 'U', grants: { tables, actions } };
}

describe('AuthStore', () => {
    let store: AuthStore;

    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        store = TestBed.inject(AuthStore);
    });

    afterEach(() => localStorage.clear());

    it('canTable via *', () => {
        store.user.set(user({ '*': ['read'] }));

        expect(store.canTable('dict_x', 'read')).toBe(true);
        expect(store.canTable('dict_x', 'write')).toBe(false);
    });

    it('canTable honours explicit table grant and does not imply read from write', () => {
        store.user.set(user({ dict_a: ['write'] }));

        expect(store.canTable('dict_a', 'write')).toBe(true);
        expect(store.canTable('dict_a', 'read')).toBe(false);
        expect(store.canTable('dict_b', 'write')).toBe(false);
    });

    it('hasAction false for empty grants', () => {
        store.user.set(user({}));

        expect(store.hasAction('admin')).toBe(false);
        expect(store.canTable('dict_x', 'read')).toBe(false);
    });

    it('hasAction true for granted action, false without user', () => {
        expect(store.hasAction('admin')).toBe(false);
        store.user.set(user({}, ['admin']));

        expect(store.hasAction('admin')).toBe(true);
    });

    it('hasAction true for any code when admin', () => {
        store.user.set(user({}, ['admin']));

        expect(store.hasAction('showcase.publish')).toBe(true);
        expect(store.hasAction('documents.approve')).toBe(true);

        store.user.set(user({}, ['showcase.publish']));
        expect(store.hasAction('showcase.publish')).toBe(true);
        expect(store.hasAction('documents.approve')).toBe(false);
        expect(store.hasAction('admin')).toBe(false);
    });

    it('clear removes token from localStorage', () => {
        store.setToken('abc');
        expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('abc');
        expect(store.isAuthenticated()).toBe(true);

        store.clear();

        expect(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
        expect(store.token()).toBeNull();
        expect(store.user()).toBeNull();
        expect(store.isAuthenticated()).toBe(false);
    });
});
