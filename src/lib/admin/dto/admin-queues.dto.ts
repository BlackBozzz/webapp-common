/** DTO Argent Queue: совпадают с REST-контрактом service-common. */
export interface ArgentQueueDto {
    id: string;
    name: string;
    allowSkip: boolean;
    paused: boolean;
    pending: number;
    running: number;
    retryWait: number;
    succeeded: number;
    cancelled: number;
}

export type ArgentQueueTaskStatus = 'PENDING' | 'RUNNING' | 'RETRY_WAIT' | 'SUCCESS' | 'PAUSED' | 'CANCELLED';

export interface ArgentQueueTaskDto {
    id: string;
    queueId: string;
    handlerKey: string;
    status: ArgentQueueTaskStatus;
    priority: number;
    attemptCount: number;
    nextRunAt: string;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    lastError: string | null;
    idempotencyKey: string | null;
}

export interface ArgentQueueAttemptDto {
    id: number;
    attemptNo: number;
    startedAt: string;
    finishedAt: string | null;
    result: 'RUNNING' | 'SUCCESS' | 'FAILED';
    errorType: string | null;
    errorMessage: string | null;
    stackTrace: string | null;
}

export interface ArgentQueueTaskDetailsDto {
    task: ArgentQueueTaskDto;
    payloadJson: string | null;
    attempts: ArgentQueueAttemptDto[];
}

export interface ArgentQueuePage<T> {
    items: T[];
    totalElements: number;
    page: number;
    size: number;
}
