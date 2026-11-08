import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AdminUsersPage } from './admin-users.page';

describe('AdminUsersPage', () => {
    let page: AdminUsersPage;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [AdminUsersPage],
            providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
        });
        const fixture = TestBed.createComponent(AdminUsersPage);
        fixture.detectChanges();
        page = fixture.componentInstance;
        // Запросы ролей и первой страницы пользователей не нужны для проверки форм.
        TestBed.inject(HttpTestingController).match(() => true);
    });

    it('passwordForm requires 6–72 characters', () => {
        const password = page['passwordForm'].controls.password;

        password.setValue('');
        expect(password.valid).toBe(false);
        password.setValue('12345');
        expect(password.valid).toBe(false);
        password.setValue('123456');
        expect(password.valid).toBe(true);
        password.setValue('x'.repeat(73));
        expect(password.valid).toBe(false);
    });

    it('createForm accepts empty password but rejects a short one', () => {
        const form = page['createForm'];
        form.setValue({ login: 'ivan', displayName: 'Иван', password: '' });
        expect(form.valid).toBe(true);

        form.controls.password.setValue('123');
        expect(form.valid).toBe(false);

        form.controls.password.setValue('123456');
        expect(form.valid).toBe(true);
    });
});
