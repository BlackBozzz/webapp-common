import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ArgentTableQuery } from '../../shared/table/dto/argent-table.dto';
import {
    ArgentQueueDto, ArgentQueuePage, ArgentQueueTaskDetailsDto, ArgentQueueTaskDto, ArgentQueueTaskView,
} from '../dto/admin-queues.dto';

/** REST-клиент Argent Queue; права дополнительно проверяются Spring Security на сервере. */
@Injectable({ providedIn: 'root' })
export class AdminQueuesApiService {
    private readonly http = inject(HttpClient);
    private readonly url = '/api/argent-queues';

    list(): Observable<ArgentQueueDto[]> {
        return this.http.get<ArgentQueueDto[]>(this.url);
    }

    /** Фильтрация, поиск и сортировка на стороне БД, до применения пагинации. */
    tasks(queueId: string, page: number, size: number,
          view: ArgentQueueTaskView = 'all', query?: ArgentTableQuery): Observable<ArgentQueuePage<ArgentQueueTaskDto>> {
        let params = new HttpParams().set('page', page).set('size', size).set('view', view);
        if (query?.search.trim()) params = params.set('search', query.search.trim());
        if (query?.sort) {
            params = params.set('sortField', query.sort.field).set('sortDirection', query.sort.direction);
        }
        for (const field of ['status', 'handlerKey', 'priority', 'attemptCount', 'sequenceNo', 'lastError'] as const) {
            const value = query?.filters[field];
            if (value !== undefined && value !== null && value !== '' && !Array.isArray(value)) {
                params = params.set(field, String(value));
            }
        }
        return this.http.get<ArgentQueuePage<ArgentQueueTaskDto>>(`${this.url}/${queueId}/tasks`, { params });
    }

    details(taskId: string): Observable<ArgentQueueTaskDetailsDto> {
        return this.http.get<ArgentQueueTaskDetailsDto>(`${this.url}/tasks/${taskId}`);
    }

    pause(queueId: string): Observable<void> {
        return this.http.post<void>(`${this.url}/${queueId}/pause`, {});
    }

    resume(queueId: string): Observable<void> {
        return this.http.post<void>(`${this.url}/${queueId}/resume`, {});
    }

    runNow(queueId: string): Observable<{ rescheduled: number }> {
        return this.http.post<{ rescheduled: number }>(`${this.url}/${queueId}/run`, {});
    }

    settings(queueId: string, allowSkip: boolean): Observable<void> {
        return this.http.patch<void>(`${this.url}/${queueId}/settings`, { allowSkip });
    }

    retry(taskId: string): Observable<void> {
        return this.http.post<void>(`${this.url}/tasks/${taskId}/retry`, {});
    }

    priority(taskId: string, priority: number): Observable<void> {
        return this.http.patch<void>(`${this.url}/tasks/${taskId}/priority`, { priority });
    }

    cancel(taskId: string): Observable<void> {
        return this.http.post<void>(`${this.url}/tasks/${taskId}/cancel`, {});
    }
}
