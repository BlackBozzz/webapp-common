import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DynamicPage } from '../../dictionary/dynamic/dto/dynamic-dictionary.dto';
import { ARGENT_ADMIN_API_CONFIG } from '../config/admin-api.config';
import {
    CreateUserRequest,
    SetPasswordRequest,
    UpdateUserRequest,
    UserDto,
    UserRolesRequest,
    UsersQuery,
} from '../dto/admin-users.dto';

/** HTTP-клиент администрирования пользователей; все методы требуют действия `admin`. */
@Injectable({ providedIn: 'root' })
export class AdminUsersApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(ARGENT_ADMIN_API_CONFIG).usersApiUrl;

    /** Страница пользователей с поиском по логину и имени. */
    list(query: UsersQuery = {}): Observable<DynamicPage<UserDto>> {
        let params = new HttpParams();
        const search = query.search?.trim();
        if (search) params = params.set('search', search);
        if (query.page !== undefined) params = params.set('page', query.page);
        if (query.size !== undefined) params = params.set('size', query.size);
        return this.http.get<DynamicPage<UserDto>>(this.baseUrl, { params });
    }

    create(request: CreateUserRequest): Observable<UserDto> {
        return this.http.post<UserDto>(this.baseUrl, request);
    }

    /** Меняет имя и активность пользователя. */
    update(id: string, request: UpdateUserRequest): Observable<UserDto> {
        return this.http.put<UserDto>(`${this.baseUrl}/${id}`, request);
    }

    setRoles(id: string, roleCodes: string[]): Observable<UserDto> {
        const body: UserRolesRequest = { roleCodes };
        return this.http.put<UserDto>(`${this.baseUrl}/${id}/roles`, body);
    }

    setPassword(id: string, password: string): Observable<void> {
        const body: SetPasswordRequest = { password };
        return this.http.post<void>(`${this.baseUrl}/${id}/password`, body);
    }

    revokeSessions(id: string): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/${id}/revoke-sessions`, null);
    }
}
