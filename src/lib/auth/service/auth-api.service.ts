import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ARGENT_AUTH_CONFIG } from '../config/auth.config';
import {
    AuthConfig,
    CurrentUser,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
} from '../dto/auth.dto';

/** Тонкий HTTP-клиент поверх REST API аутентификации service-common. */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(ARGENT_AUTH_CONFIG).apiBaseUrl;

    /** Публичные настройки входа: нужен ли пароль и разрешена ли регистрация. */
    config(): Observable<AuthConfig> {
        return this.http.get<AuthConfig>(`${this.baseUrl}/config`);
    }

    /** Вход по логину (и паролю, если он требуется); возвращает JWT. */
    login(request: LoginRequest): Observable<LoginResponse> {
        return this.http.post<LoginResponse>(`${this.baseUrl}/login`, request);
    }

    /** Регистрация нового пользователя; возвращает JWT. */
    register(request: RegisterRequest): Observable<LoginResponse> {
        return this.http.post<LoginResponse>(`${this.baseUrl}/register`, request);
    }

    /** Выход на стороне backend. */
    logout(): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/logout`, null);
    }

    /** Текущий пользователь с грантами. */
    me(): Observable<CurrentUser> {
        return this.http.get<CurrentUser>(`${this.baseUrl}/me`);
    }
}
