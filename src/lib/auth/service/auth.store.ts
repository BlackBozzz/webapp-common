import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { CurrentUser, TableOperation } from '../dto/auth.dto';
import { AuthApiService } from './auth-api.service';

/** Ключ localStorage, под которым хранится JWT. */
export const AUTH_TOKEN_STORAGE_KEY = 'argent.auth.token';

/**
 * Состояние сессии: JWT (сохраняется в localStorage) и текущий пользователь с грантами.
 * Проверки `canTable`/`hasAction` нужны только для UI — права всё равно проверяет backend.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
    private readonly api = inject(AuthApiService);
    private readonly tokenState = signal<string | null>(readStoredToken());

    /** Текущий JWT или `null`. */
    readonly token = this.tokenState.asReadonly();
    /** Текущий пользователь; `null`, пока не загружен через {@link loadUser}. */
    readonly user = signal<CurrentUser | null>(null);
    /** Есть ли токен (пользователь мог ещё не загрузиться). */
    readonly isAuthenticated = computed(() => this.tokenState() !== null);

    /**
     * Разрешена ли операция над таблицей — по гранту самой таблицы или ключа `*`.
     * `write` не включает `read`; действие `admin` таблиц не открывает (только проверки действий).
     */
    canTable(table: string, op: TableOperation): boolean {
        const tables = this.user()?.grants.tables;
        if (!tables) {
            return false;
        }
        return (tables[table]?.includes(op) ?? false) || (tables['*']?.includes(op) ?? false);
    }

    /**
     * Разрешено ли действие с указанным кодом, например `admin`.
     * Встроенное действие `admin` — суперпользовательское, как на backend: его держатель проходит
     * проверку любого действия.
     */
    hasAction(code: string): boolean {
        const actions = this.user()?.grants.actions ?? [];
        return actions.includes(code) || actions.includes('admin');
    }

    /** Сохраняет новый JWT (после входа или регистрации). */
    setToken(token: string): void {
        this.tokenState.set(token);
        writeStoredToken(token);
    }

    /** Забывает токен и пользователя (выход или истёкшая сессия). */
    clear(): void {
        this.tokenState.set(null);
        this.user.set(null);
        writeStoredToken(null);
    }

    /** Загружает текущего пользователя с backend и кладёт его в {@link user}. */
    loadUser(): Observable<CurrentUser> {
        return this.api.me().pipe(tap((user) => this.user.set(user)));
    }
}

/** Читает токен из localStorage; недоступное хранилище (приватный режим, SSR) — не ошибка. */
function readStoredToken(): string | null {
    try {
        return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
}

/** Пишет или удаляет токен в localStorage, молча игнорируя недоступное хранилище. */
function writeStoredToken(token: string | null): void {
    try {
        if (token === null) {
            localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        } else {
            localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
        }
    } catch {
        // Хранилище недоступно — токен живёт только в памяти до перезагрузки страницы.
    }
}
