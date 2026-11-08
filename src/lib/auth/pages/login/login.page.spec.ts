import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthConfig } from '../../dto/auth.dto';
import { AuthApiService } from '../../service/auth-api.service';
import { AuthStore } from '../../service/auth.store';
import { LoginPage } from './login.page';

/** Создаёт страницу входа с подменённым `AuthApiService.config()`. */
async function render(config: AuthConfig): Promise<HTMLElement> {
    TestBed.configureTestingModule({
        imports: [LoginPage],
        providers: [
            provideRouter([]),
            { provide: AuthApiService, useValue: { config: () => of(config) } },
        ],
    });
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
}

describe('LoginPage', () => {
    it('shows only login field when password not required', async () => {
        const element = await render({ passwordRequired: false, registrationEnabled: false });

        expect(element.querySelector('input[formControlName="login"]')).not.toBeNull();
        expect(element.querySelector('input[formControlName="password"]')).toBeNull();
    });

    it('shows password field when required', async () => {
        const element = await render({ passwordRequired: true, registrationEnabled: false });

        expect(element.querySelector('input[formControlName="login"]')).not.toBeNull();
        expect(element.querySelector('input[formControlName="password"]')).not.toBeNull();
    });

    it('redirects authenticated user to /admin', async () => {
        TestBed.configureTestingModule({
            imports: [LoginPage],
            providers: [
                provideRouter([]),
                {
                    provide: AuthApiService,
                    useValue: { config: () => of({ passwordRequired: false, registrationEnabled: false }) },
                },
            ],
        });
        TestBed.inject(AuthStore).setToken('x');
        const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

        const fixture = TestBed.createComponent(LoginPage);
        fixture.detectChanges();
        await fixture.whenStable();

        expect(navigate).toHaveBeenCalledWith('/admin');
    });
});
