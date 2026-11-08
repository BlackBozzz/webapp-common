import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ARGENT_ADMIN_API_CONFIG } from '../config/admin-api.config';
import { GrantsCatalog, RoleDto, RoleRequest } from '../dto/admin-roles.dto';

/** HTTP-клиент администрирования ролей; все методы требуют действия `admin`. */
@Injectable({ providedIn: 'root' })
export class AdminRolesApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(ARGENT_ADMIN_API_CONFIG).rolesApiUrl;
    /**
     * Каталог грантов лежит рядом с API ролей: `/api/roles` → `/api/grants/catalog`
     * (тот же префикс, например при прокси `/backend/api/roles`).
     */
    private readonly catalogUrl = this.baseUrl.replace(/\/roles$/, '') + '/grants/catalog';

    list(): Observable<RoleDto[]> {
        return this.http.get<RoleDto[]>(this.baseUrl);
    }

    get(code: string): Observable<RoleDto> {
        return this.http.get<RoleDto>(`${this.baseUrl}/${encodeURIComponent(code)}`);
    }

    /** Создаёт или изменяет роль; у системной роли сервер игнорирует гранты. */
    upsert(code: string, request: RoleRequest): Observable<RoleDto> {
        return this.http.put<RoleDto>(`${this.baseUrl}/${encodeURIComponent(code)}`, request);
    }

    /** Удаляет роль; 409 — системная или назначенная пользователям. */
    remove(code: string): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(code)}`);
    }

    /** Подсказки для редактора грантов: таблицы и действия. */
    catalog(): Observable<GrantsCatalog> {
        return this.http.get<GrantsCatalog>(this.catalogUrl);
    }
}
