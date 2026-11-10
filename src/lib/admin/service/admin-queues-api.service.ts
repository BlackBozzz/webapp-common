import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
    ArgentQueueDto, ArgentQueuePage, ArgentQueueTaskDetailsDto, ArgentQueueTaskDto,
} from '../dto/admin-queues.dto';

/** REST-клиент Argent Queue; права дополнительно проверяются Spring Security на сервере. */
@Injectable({ providedIn: 'root' })
export class AdminQueuesApiService {
    private readonly http = inject(HttpClient);
    private readonly url = '/api/argent-queues';

    list(): Observable<ArgentQueueDto[]> {
        return this.http.get<ArgentQueueDto[]>(this.url);
    }

    tasks(queueId: string, page: number, size: number): Observable<ArgentQueuePage<ArgentQueueTaskDto>> {
        return this.http.get<ArgentQueuePage<ArgentQueueTaskDto>>(`${this.url}/${queueId}/tasks`, {
            params: new HttpParams().set('page', page).set('size', size),
        });
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
