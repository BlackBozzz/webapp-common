import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { finalize, Observable, switchMap, tap } from 'rxjs';
import { FieldErrorComponent } from '../../../errors/field-error/field-error.component';
import { applyServerErrors, problemMessage } from '../../../errors/problem-detail';
import { AuthConfig, LoginRequest, LoginResponse } from '../../dto/auth.dto';
import { AuthApiService } from '../../service/auth-api.service';
import { AuthStore } from '../../service/auth.store';

/** Режим страницы: вход или самостоятельная регистрация. */
type LoginMode = 'login' | 'register';

/** Маршрут по умолчанию после входа, если в адресе нет `returnUrl`. */
const DEFAULT_RETURN_URL = '/admin';

/**
 * Страница входа. По `GET /api/auth/config` показывает одно поле (логин) или два (логин и пароль),
 * а если backend разрешает регистрацию — переключатель на форму регистрации.
 * После успеха сохраняет JWT, загружает пользователя и возвращает на `returnUrl` (или `/admin`).
 */
@Component({
    selector: 'argent-login-page',
    standalone: true,
    imports: [ReactiveFormsModule, Button, InputText, Message, FieldErrorComponent],
    templateUrl: './login.page.html',
    styleUrl: './login.page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage implements OnInit {
    private readonly api = inject(AuthApiService);
    private readonly store = inject(AuthStore);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly destroyRef = inject(DestroyRef);

    /** Настройки входа; `null`, пока не загружены. */
    protected readonly config = signal<AuthConfig | null>(null);
    protected readonly mode = signal<LoginMode>('login');
    protected readonly loading = signal(false);
    /** Общее сообщение об ошибке, не привязанное к полю. */
    protected readonly error = signal<string | null>(null);

    protected readonly loginForm = new FormGroup({
        login: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
        password: new FormControl('', { nonNullable: true }),
    });

    protected readonly registerForm = new FormGroup({
        login: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
        displayName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
        password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    });

    ngOnInit(): void {
        if (this.store.isAuthenticated()) {
            // Уже вошедшему пользователю форма не нужна.
            void this.router.navigateByUrl(this.returnUrl());
            return;
        }
        this.api
            .config()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (config) => this.applyConfig(config),
                error: (error: unknown) => {
                    // Без настроек показываем полную форму входа: пароль всё равно проверит backend.
                    this.applyConfig({ passwordRequired: true, registrationEnabled: false });
                    this.error.set(problemMessage(error, 'Не удалось загрузить настройки входа'));
                },
            });
    }

    /** Переключает форму между входом и регистрацией. */
    protected switchMode(mode: LoginMode): void {
        this.mode.set(mode);
        this.error.set(null);
    }

    protected submit(): void {
        const register = this.mode() === 'register';
        const form: FormGroup = register ? this.registerForm : this.loginForm;
        if (form.invalid) {
            form.markAllAsTouched();
            return;
        }

        const request$: Observable<LoginResponse> = register
            ? this.api.register(this.registerForm.getRawValue())
            : this.api.login(this.loginRequest());

        this.loading.set(true);
        this.error.set(null);
        let tokenSaved = false;
        request$
            .pipe(
                tap((response) => {
                    this.store.setToken(response.token);
                    tokenSaved = true;
                }),
                switchMap(() => this.store.loadUser()),
                finalize(() => this.loading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe({
                next: () => void this.router.navigateByUrl(this.returnUrl()),
                error: (error: unknown) => {
                    if (tokenSaved) {
                        // Токен получен, но пользователя загрузить не удалось — не оставляем полусессию.
                        this.store.clear();
                    }
                    this.showError(form, error, register);
                },
            });
    }

    /** Запоминает настройки и включает обязательность пароля, если backend его требует. */
    private applyConfig(config: AuthConfig): void {
        const password = this.loginForm.controls.password;
        password.setValidators(config.passwordRequired ? [Validators.required] : []);
        password.updateValueAndValidity();
        this.config.set(config);
    }

    /** Тело запроса входа: пароль отправляется, только если он требуется. */
    private loginRequest(): LoginRequest {
        const { login, password } = this.loginForm.getRawValue();
        return this.config()?.passwordRequired ? { login, password } : { login };
    }

    /**
     * 401 при входе — неверные учётные данные; ошибки валидации — под поля формы;
     * всё остальное — общим сообщением.
     */
    private showError(form: FormGroup, error: unknown, register: boolean): void {
        if (!register && error instanceof HttpErrorResponse && error.status === 401) {
            this.error.set(
                this.config()?.passwordRequired
                    ? 'Неверный логин или пароль'
                    : problemMessage(error, 'Не удалось войти'),
            );
            return;
        }
        if (!applyServerErrors(form, error)) {
            this.error.set(
                problemMessage(error, register ? 'Не удалось зарегистрироваться' : 'Не удалось войти'),
            );
        }
    }

    /** Куда вернуться после входа: только внутренний путь приложения. */
    private returnUrl(): string {
        const url = this.route.snapshot.queryParamMap.get('returnUrl');
        return url && url.startsWith('/') && !url.startsWith('//') ? url : DEFAULT_RETURN_URL;
    }
}
