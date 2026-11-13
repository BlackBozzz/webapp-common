import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, Subscription, auditTime, timer } from 'rxjs';
import { ArgentAdminLiveService } from '../../service/argent-admin-live.service';
import { AuthStore } from '../../../auth/service/auth.store';
import { ArgentTableComponent } from '../../../shared/table/components/argent-table/argent-table.component';
import { ArgentTableColumnComponent } from '../../../shared/table/components/argent-table-column/argent-table-column.component';
import { ArgentTableQuery } from '../../../shared/table/dto/argent-table.dto';
import {
    ArgentQueueDto, ArgentQueuePage, ArgentQueueTaskDetailsDto, ArgentQueueTaskDto,
    ArgentQueueTaskStatus, ArgentQueueTaskView,
} from '../../dto/admin-queues.dto';
import { AdminQueuesApiService } from '../../service/admin-queues-api.service';

/** Списки очередей и задач; история и stack trace — в боковой панели. */
@Component({
    selector: 'argent-admin-queues',
    standalone: true,
    imports: [CommonModule, FormsModule, ArgentTableComponent, ArgentTableColumnComponent],
    templateUrl: './admin-queues.page.html',
    styleUrl: './admin-queues.page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminQueuesPage implements OnInit {
    private readonly api = inject(AdminQueuesApiService);
    private readonly live = inject(ArgentAdminLiveService);
    private readonly auth = inject(AuthStore);
    private readonly destroyRef = inject(DestroyRef);
    @ViewChild(ArgentTableComponent) private taskTable?: ArgentTableComponent;
    private queuesRequest?: Subscription;
    private pageRequest?: Subscription;
    private detailsRequest?: Subscription;
    private readonly queueRefreshEvent = new Subject<void>();

    readonly queues = signal<ArgentQueueDto[]>([]);
    readonly selectedQueueId = signal<string | null>(null);
    readonly page = signal<ArgentQueuePage<ArgentQueueTaskDto> | null>(null);
    readonly selectedTask = signal<ArgentQueueTaskDto | null>(null);
    readonly details = signal<ArgentQueueTaskDetailsDto | null>(null);
    readonly error = signal('');
    readonly notice = signal('');
    readonly loading = signal(false);
    readonly saving = signal(false);
    readonly taskViews: ReadonlyArray<{ key: ArgentQueueTaskView; label: string }> = [
        { key: 'all', label: 'Все' },
        { key: 'waiting', label: 'Ожидают' },
        { key: 'done', label: 'Выполненные' },
        { key: 'errors', label: 'С ошибками' },
    ];
    readonly taskView = signal<ArgentQueueTaskView>('all');
    private readonly tableQuery = signal<ArgentTableQuery>({
        page: 0, size: 20, search: '', sort: null, filters: {},
    });
    readonly pageIndex = signal(0);
    readonly pageSize = signal(20);
    readonly editedPriority = signal(0);
    readonly liveConnected = signal(false);
    readonly refreshedAt = signal<Date | null>(null);

    readonly canManage = computed(() => {
        this.auth.user();
        return this.auth.hasAction('admin');
    });
    readonly selectedQueue = computed(() => this.queues().find(queue => queue.id === this.selectedQueueId()) ?? null);
    readonly waiting = computed(() => this.queues().reduce((sum, queue) => sum + queue.pending, 0));
    readonly running = computed(() => this.queues().reduce((sum, queue) => sum + queue.running, 0));
    readonly failing = computed(() => this.queues().reduce((sum, queue) => sum + queue.retryWait, 0));

    constructor() {
        this.destroyRef.onDestroy(() => {
            this.queuesRequest?.unsubscribe();
            this.pageRequest?.unsubscribe();
            this.detailsRequest?.unsubscribe();
        });
    }

    ngOnInit(): void {
        this.refreshQueues();
        this.live.connect().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
            if (event.type === 'connected') this.liveConnected.set(true);
            if (event.type === 'disconnected') this.liveConnected.set(false);
            if (event.type === 'queues.changed') this.queueRefreshEvent.next();
        });
        // Coalesce bursts of queue changes before querying the REST API.
        this.queueRefreshEvent.pipe(auditTime(500), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.refresh());
        // Safety net for lost events, cross-JVM workers, or servers with live updates disabled.
        timer(15_000, 15_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            if (!this.liveConnected()) this.refresh();
        });
        timer(60_000, 60_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            if (this.liveConnected()) this.refresh();
        });
    }

    refreshQueues(): void {
        this.error.set('');
        this.queuesRequest?.unsubscribe();
        this.queuesRequest = this.api.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: queues => {
                this.queues.set(queues);
                if (!queues.some(queue => queue.id === this.selectedQueueId())) {
                    this.selectQueue(queues[0] ?? null);
                }
            },
            error: error => this.fail(error),
        });
    }

    selectQueue(queue: ArgentQueueDto | null): void {
        if (queue?.id === this.selectedQueueId()) return;
        this.pageRequest?.unsubscribe();
        this.detailsRequest?.unsubscribe();
        this.selectedQueueId.set(queue?.id ?? null);
        this.selectedTask.set(null);
        this.details.set(null);
        this.page.set(null);
        this.pageIndex.set(0);
        this.tableQuery.update(query => ({ ...query, page: 0 }));
        // Начальную загрузку сделает gridReady, для уже открытой таблицы обновим datasource.
        if (queue) this.taskTable?.refreshRows();
    }

    onQuery(query: ArgentTableQuery): void {
        this.tableQuery.set(query);
        this.pageIndex.set(query.page);
        this.pageSize.set(query.size);
        this.loadPage();
    }

    /** Не только перечитать REST-страницу, но и инвалидировать кэш Infinite Row Model. */
    refresh(): void {
        this.refreshQueues();
        this.taskTable?.refreshRows();
        this.reloadDetails();
    }

    changeTaskView(view: ArgentQueueTaskView): void {
        if (view === this.taskView()) return;
        this.taskView.set(view);
        this.pageIndex.set(0);
        this.page.set(null);
        this.taskTable?.refreshRows();
    }

    selectTask(row: unknown): void {
        const task = row as ArgentQueueTaskDto | null;
        // Сброс выделения при сбросе кэша AG Grid не должен закрывать панель подробностей.
        if (!task || task.id === this.selectedTask()?.id) return;
        this.openTask(task);
    }

    openTask(task: ArgentQueueTaskDto | null): void {
        this.detailsRequest?.unsubscribe();
        this.selectedTask.set(task);
        this.details.set(null);
        this.editedPriority.set(task?.priority ?? 0);
        if (!task) return;
        this.detailsRequest = this.api.details(task.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: value => {
                this.details.set(value);
                this.editedPriority.set(value.task.priority);
            },
            error: error => this.fail(error),
        });
    }

    /** Refresh drawer data without interrupting priority editing. */
    private reloadDetails(): void {
        const task = this.selectedTask();
        if (!task) return;
        this.detailsRequest?.unsubscribe();
        this.detailsRequest = this.api.details(task.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: value => {
                this.details.set(value);
                this.selectedTask.set(value.task);
            },
            error: error => this.fail(error),
        });
    }

    closeDetails(): void {
        this.detailsRequest?.unsubscribe();
        this.details.set(null);
        this.selectedTask.set(null);
    }

    pauseOrResume(): void {
        const queue = this.selectedQueue();
        if (!queue || !this.canManage()) return;
        this.act(queue.paused ? this.api.resume(queue.id) : this.api.pause(queue.id),
            queue.paused ? 'Очередь возобновлена' : 'Очередь приостановлена');
    }

    runNow(): void {
        const queue = this.selectedQueue();
        if (!queue || !this.canManage()) return;
        this.act(this.api.runNow(queue.id), 'Ожидающие повторы перенесены на ближайший запуск');
    }

    toggleSkip(): void {
        const queue = this.selectedQueue();
        if (!queue || !this.canManage()) return;
        this.act(this.api.settings(queue.id, !queue.allowSkip), 'Режим очереди изменён');
    }

    retry(): void {
        const task = this.selectedTask();
        if (task?.status !== 'RETRY_WAIT' || !this.canManage()) return;
        this.act(this.api.retry(task.id), 'Задача поставлена на повтор');
    }

    cancel(): void {
        const task = this.selectedTask();
        if (!task || !this.canManage()) return;
        if (!confirm('Отменить задачу? Это действие нельзя отменить.')) return;
        this.act(this.api.cancel(task.id), 'Задача отменена');
    }

    savePriority(): void {
        const task = this.selectedTask();
        const priority = Number(this.editedPriority());
        if (!task || !this.canManage() || !Number.isSafeInteger(priority)) return;
        this.act(this.api.priority(task.id, priority), 'Приоритет сохранён');
    }

    statusLabel(status: ArgentQueueTaskStatus): string {
        const labels: Record<ArgentQueueTaskStatus, string> = {
            PENDING: 'Ожидает', RUNNING: 'Работает', RETRY_WAIT: 'Ожидает повтора',
            SUCCESS: 'Успешно', PAUSED: 'На паузе', CANCELLED: 'Отменена',
        };
        return labels[status] ?? status;
    }

    private loadPage(): void {
        const id = this.selectedQueueId();
        if (!id) return;
        this.pageRequest?.unsubscribe();
        this.loading.set(true);
        this.pageRequest = this.api.tasks(
            id, this.pageIndex(), this.pageSize(), this.taskView(), this.tableQuery())
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: page => {
                    this.page.set(page);
                    this.refreshedAt.set(new Date());
                    this.loading.set(false);
                },
                error: error => {
                    this.loading.set(false);
                    this.fail(error);
                },
            });
    }

    private act(request: import('rxjs').Observable<unknown>, message: string): void {
        this.saving.set(true);
        this.error.set('');
        request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: () => {
                this.saving.set(false);
                this.notice.set(message);
                this.refresh();
            },
            error: error => {
                this.saving.set(false);
                this.fail(error);
            },
        });
    }

    private fail(error: unknown): void {
        if (error instanceof HttpErrorResponse) {
            const detail = error.error?.detail ?? error.error?.message;
            this.error.set(typeof detail === 'string' ? detail : `Ошибка HTTP ${error.status}`);
        } else {
            this.error.set('Не удалось получить данные очередей');
        }
    }
}
