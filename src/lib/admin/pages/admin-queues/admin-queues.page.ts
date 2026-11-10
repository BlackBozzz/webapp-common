import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthStore } from '../../../auth/service/auth.store';
import { ArgentTableComponent } from '../../../shared/table/components/argent-table/argent-table.component';
import { ArgentTableColumnComponent } from '../../../shared/table/components/argent-table-column/argent-table-column.component';
import { ArgentTableQuery } from '../../../shared/table/dto/argent-table.dto';
import {
    ArgentQueueDto, ArgentQueuePage, ArgentQueueTaskDetailsDto, ArgentQueueTaskDto,
    ArgentQueueTaskStatus,
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
    private readonly auth = inject(AuthStore);
    private readonly destroyRef = inject(DestroyRef);
    private pageRequest?: Subscription;
    private detailsRequest?: Subscription;

    readonly queues = signal<ArgentQueueDto[]>([]);
    readonly selectedQueueId = signal<string | null>(null);
    readonly page = signal<ArgentQueuePage<ArgentQueueTaskDto> | null>(null);
    readonly selectedTask = signal<ArgentQueueTaskDto | null>(null);
    readonly details = signal<ArgentQueueTaskDetailsDto | null>(null);
    readonly error = signal('');
    readonly notice = signal('');
    readonly loading = signal(false);
    readonly saving = signal(false);
    readonly pageIndex = signal(0);
    readonly pageSize = signal(20);
    readonly editedPriority = signal(0);

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
            this.pageRequest?.unsubscribe();
            this.detailsRequest?.unsubscribe();
        });
    }

    ngOnInit(): void { this.refreshQueues(); }

    refreshQueues(): void {
        this.error.set('');
        this.api.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
        if (queue) this.loadPage();
    }

    onQuery(query: ArgentTableQuery): void {
        this.pageIndex.set(query.page);
        this.pageSize.set(query.size);
        this.loadPage();
    }

    refresh(): void {
        this.refreshQueues();
        this.loadPage();
        if (this.selectedTask()) this.openTask(this.selectedTask());
    }

    selectTask(row: unknown): void {
        const task = row as ArgentQueueTaskDto | null;
        if (task?.id === this.selectedTask()?.id) return;
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
        this.pageRequest = this.api.tasks(id, this.pageIndex(), this.pageSize())
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: page => {
                    this.page.set(page);
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
                const task = this.selectedTask();
                this.refreshQueues();
                this.loadPage();
                if (task) this.openTask(task);
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
