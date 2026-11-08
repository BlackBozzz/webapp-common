import { HttpErrorResponse } from '@angular/common/http';
import {
    ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, output, signal, untracked, viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { RadioButtonModule } from 'primeng/radiobutton';
import { TableModule } from 'primeng/table';
import { Subscription } from 'rxjs';
import { problemMessage } from '../../../../../errors/problem-detail';
import { DictionaryImportMode, ImportReport } from '../../../dto/dictionary-transfer.dto';
import { DictionaryTransferApiService } from '../../../service/dictionary-transfer-api.service';

/**
 * Импорт XLSX/CSV в справочник `code` с отчётом по строкам.
 * Отчёт показывается и после успеха, и при отмене импорта (400 с `report`).
 */
@Component({
    selector: 'argent-dictionary-import-dialog',
    standalone: true,
    imports: [FormsModule, ButtonModule, DialogModule, MessageModule, RadioButtonModule, TableModule],
    templateUrl: './dictionary-import-dialog.component.html',
    styleUrl: './dictionary-import-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryImportDialogComponent {
    private readonly api = inject(DictionaryTransferApiService);
    private request?: Subscription;

    /** Код справочника. */
    readonly code = input.required<string>();
    readonly visible = input(false);

    readonly visibleChange = output<boolean>();
    /** Импорт выполнен (ответ 200); страница перечитывает записи. */
    readonly imported = output<ImportReport>();

    readonly file = signal<File | null>(null);
    readonly mode = signal<DictionaryImportMode>('UPSERT');
    readonly importing = signal(false);
    readonly report = signal<ImportReport | null>(null);
    readonly error = signal('');

    private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

    constructor() {
        // Каждое открытие и смена справочника начинаются с чистой формы.
        effect(() => {
            const visible = this.visible();
            this.code();
            if (visible) {
                untracked(() => this.reset());
            }
        });
        inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
    }

    onFileSelected(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.selectFile(target.files?.[0] ?? null);
    }

    selectFile(file: File | null): void {
        this.file.set(file);
        this.report.set(null);
        this.error.set('');
    }

    submit(): void {
        const file = this.file();
        if (!file || this.importing()) return;
        this.importing.set(true);
        this.report.set(null);
        this.error.set('');
        this.request = this.api.import(this.code(), file, this.mode()).subscribe({
            next: report => {
                this.importing.set(false);
                this.report.set(report);
                this.imported.emit(report);
            },
            error: (error: unknown) => {
                this.importing.set(false);
                this.report.set(reportFromError(error));
                this.error.set(problemMessage(error, 'Не удалось выполнить импорт'));
            },
        });
    }

    close(): void {
        this.reset();
        this.visibleChange.emit(false);
    }

    private reset(): void {
        this.request?.unsubscribe();
        this.importing.set(false);
        this.file.set(null);
        this.mode.set('UPSERT');
        this.report.set(null);
        this.error.set('');
        const input = this.fileInput()?.nativeElement;
        if (input) {
            input.value = '';
        }
    }
}

/** Отчёт из ProblemDetail 400 «Импорт отменён: в данных есть ошибки». */
function reportFromError(error: unknown): ImportReport | null {
    if (!(error instanceof HttpErrorResponse) || error.status !== 400) return null;
    const report = (error.error as { report?: ImportReport } | null)?.report;
    return report && Array.isArray(report.errors) ? report : null;
}
