import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

export type ArgentLiveEvent =
    | { type: 'connected' }
    | { type: 'disconnected' }
    | { type: 'queues.changed' }
    | { type: 'audit.changed' };

/**
 * WebSocket notifications; existing authenticated REST APIs still provide all actual data.
 * A one-use ticket is obtained with the JWT HTTP interceptor. JWT never goes into the WS URL.
 * Each subscription owns its socket and closes it when its admin page is destroyed.
 */
@Injectable({ providedIn: 'root' })
export class ArgentAdminLiveService {
    private readonly http = inject(HttpClient);

    connect(): Observable<ArgentLiveEvent> {
        return new Observable<ArgentLiveEvent>(observer => {
            let stopped = false;
            let socket: WebSocket | null = null;
            let ticketRequest: Subscription | null = null;
            let retryTimer: ReturnType<typeof setTimeout> | null = null;
            let failures = 0;

            const reconnect = (): void => {
                if (stopped || retryTimer !== null) return;
                observer.next({ type: 'disconnected' });
                const delay = Math.min(30_000, 1_000 * (2 ** Math.min(failures++, 5)));
                retryTimer = setTimeout(() => {
                    retryTimer = null;
                    connect();
                }, delay);
            };

            const connect = (): void => {
                if (stopped) return;
                ticketRequest = this.http.get<{ ticket: string }>('/api/argent-live/ticket').subscribe({
                    next: ({ ticket }) => {
                        if (stopped) return;
                        try {
                            const url = new URL('/api/argent-live/ws', window.location.href);
                            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
                            url.searchParams.set('ticket', ticket);
                            const ws = new WebSocket(url.toString());
                            socket = ws;
                            ws.onopen = () => {
                                failures = 0;
                                observer.next({ type: 'connected' });
                            };
                            ws.onmessage = message => {
                                try {
                                    const event: unknown = JSON.parse(String(message.data));
                                    if (isLiveChange(event)) observer.next(event);
                                } catch { /* ignore malformed notifications */ }
                            };
                            ws.onerror = () => ws.close();
                            ws.onclose = () => {
                                if (socket === ws) socket = null;
                                reconnect();
                            };
                        } catch {
                            reconnect();
                        }
                    },
                    error: error => {
                        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
                            observer.next({ type: 'disconnected' });
                            return; // Access was denied; avoid retrying/toasting forever.
                        }
                        reconnect();
                    },
                });
            };

            connect();
            return () => {
                stopped = true;
                ticketRequest?.unsubscribe();
                if (retryTimer !== null) clearTimeout(retryTimer);
                if (socket) {
                    socket.onclose = null;
                    socket.onerror = null;
                    socket.onmessage = null;
                    socket.close();
                }
            };
        });
    }
}

function isLiveChange(value: unknown): value is Extract<ArgentLiveEvent, { type: 'queues.changed' | 'audit.changed' }> {
    if (!value || typeof value !== 'object' || !('type' in value)) return false;
    return value.type === 'queues.changed' || value.type === 'audit.changed';
}
