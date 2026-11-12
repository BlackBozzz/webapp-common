import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AdminUsersPage } from './admin-users.page';
import { UserDto } from '../../dto/admin-users.dto';
import { RoleDto } from '../../dto/admin-roles.dto';

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

    it('opens create dialog from Add button in table toolbar', () => {
        const fixture = TestBed.createComponent(AdminUsersPage);
        fixture.detectChanges();
        const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('argent-table-toolbar button'))
            .find(item => item.textContent?.includes('Добавить'));
        expect(button).toBeTruthy();
        button!.click();
        expect(fixture.componentInstance['createVisible']()).toBe(true);
    });

    it('submits creation request once and closes dialog on success', () => {
        const form = page['createForm'];
        page['openCreate']();
        form.setValue({ login: '  newuser ', displayName: ' Новый ', email: 'test@example.com', password: '' });
        page['create']();
        page['create'](); // пока запрос в процессе — второй запрос не создаётся
        const http = TestBed.inject(HttpTestingController);
        const request = http.expectOne(r => r.method === 'POST' && r.url.includes('/users'));
        expect(request.request.body).toEqual({ login: 'newuser', displayName: 'Новый', email: 'test@example.com' });
        request.flush({ id: 'u1', login: 'newuser' });
        expect(page['createVisible']()).toBe(false);
        http.match(() => true); // перечитывание списка после создания
    });

    it('rejects whitespace-only login and display name', () => {
        const form = page['createForm'];
        form.setValue({ login: '   ', displayName: ' ', email: '', password: '' });
        expect(form.invalid).toBe(true);
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
        form.setValue({ login: 'ivan', displayName: 'Иван', email: '', password: '' });
        expect(form.valid).toBe(true);

        form.controls.password.setValue('123');
        expect(form.valid).toBe(false);

        form.controls.password.setValue('123456');
        expect(form.valid).toBe(true);
    });
    it('shows role names without waiting for MultiSelect interaction', () => {
        page['roles'].set([{ code: 'ADMIN', name: 'Администратор' } as RoleDto]);
        expect(page['roleLabel']('ADMIN')).toBe('Администратор');
        expect(page['roleLabel']('UNLISTED')).toBe('UNLISTED');
    });

    it('tolerates an AG Grid placeholder and a user without roles', () => {
        expect(page['rolesOf'](undefined)).toEqual([]);
        const legacyUser = {
            id: 'u1', login: 'legacy', displayName: 'Legacy', enabled: true,
            hasPassword: false, createdAt: '2026-01-01T00:00:00Z',
        } as UserDto;
        expect(() => page['openActions'](undefined)).not.toThrow();
        expect(() => page['openActions'](legacyUser)).not.toThrow();
        expect(page['actionRoles']()).toEqual([]);
        expect(page['actionUser']()?.roles).toEqual([]);
        expect(page['hasRoleChanges'](legacyUser)).toBe(false);
    });

    it('opens actions and recognizes unsaved role changes', () => {
        const user: UserDto = {
            id: 'u1', login: 'ivan', displayName: 'Иван', email: null,
            roles: ['ADMIN'], enabled: true, hasPassword: true, createdAt: '2026-01-01T00:00:00Z',
        };
        page['openActions'](user);
        expect(page['actionUser']()?.id).toBe(user.id);
        expect(page['hasRoleChanges'](user)).toBe(false);
        page['actionRoles'].set(['ADMIN', 'USER']);
        expect(page['hasRoleChanges'](user)).toBe(true);
    });
});
