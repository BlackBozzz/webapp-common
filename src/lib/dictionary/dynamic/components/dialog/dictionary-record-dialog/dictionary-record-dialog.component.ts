import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { FormGroup } from '@angular/forms';
import { ButtonDirective } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TabsModule } from 'primeng/tabs';
import { AttachmentsComponent } from '../../../../../attachments/components/attachments/attachments.component';
import { AuditLogComponent } from '../../../../../audit/components/audit-log/audit-log.component';
import { DynamicDictionarySchema } from '../../../dto/dynamic-dictionary.dto';
import { DictionaryRecord, DynamicDictionaryFormService } from '../../../service/dynamic-dictionary-form.service';
import { DynamicDictionaryApiService } from '../../../service/dynamic-dictionary-api.service';
import { DynamicDictionaryErrorService } from '../../../service/dynamic-dictionary-error.service';
import { DictionaryDynamicFormComponent } from '../../form/dictionary-dynamic-form/dictionary-dynamic-form.component';

/** Один диалог для POST и PUT. Каждое открытие PUT заново запрашивает DTO. */
@Component({
    selector: 'argent-dictionary-record-dialog',
    standalone: true,
    imports: [
        NgTemplateOutlet, ButtonDirective, DialogModule, TabsModule,
        DictionaryDynamicFormComponent, AttachmentsComponent, AuditLogComponent,
    ],
    templateUrl: './dictionary-record-dialog.component.html',
    styleUrl: './dictionary-record-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.Default,
})
export class DictionaryRecordDialogComponent implements OnChanges {
    @Input({ required: true }) code = '';
    @Input({ required: true }) schema: DynamicDictionarySchema | null = null;
    @Input() recordId: string | null = null;
    @Input() visible = false;
    /** Просмотр без права `write`: форма отключена, сохранения нет, вложения только для чтения. */
    @Input() readonly = false;

    @Output() visibleChange = new EventEmitter<boolean>();
    @Output() saved = new EventEmitter<void>();

    private readonly api = inject(DynamicDictionaryApiService);
    private readonly forms = inject(DynamicDictionaryFormService);
    private readonly errors = inject(DynamicDictionaryErrorService);
    private readonly destroyRef = inject(DestroyRef);
    private requestVersion = 0;

    form = new FormGroup({});
    loading = false;
    saving = false;
    error = '';
    loadingFailed = false;
    /** Вкладка диалога редактирования; при создании записи вкладок нет. */
    readonly activeTab = signal<string | number | undefined>('fields');

    get heading(): string {
        if (this.readonly) return 'Просмотр записи';
        return this.recordId ? 'Редактирование записи' : 'Новая запись';
    }

    get canSave(): boolean {
        return !this.readonly && !this.loading && !this.saving && !!this.schema && this.form.valid && !this.form.pending;
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.visible) {
            this.requestVersion++;
            return;
        }
        if (changes['visible'] || changes['recordId'] || changes['code'] || changes['schema'] || changes['readonly']) {
            this.initialize();
        }
    }

    close(): void {
        if (this.saving) return;
        this.requestVersion++;
        this.visibleChange.emit(false);
    }

    save(): void {
        if (this.readonly || !this.schema || this.loading || this.saving) return;
        this.form.markAllAsTouched();
        if (this.form.invalid || this.form.pending) return;

        this.saving = true;
        this.error = '';
        const payload = this.forms.toDto(this.schema, this.form);
        const operation = this.recordId
            ? this.api.updateRecord(this.code, this.recordId, payload)
            : this.api.createRecord(this.code, payload);
        const version = this.requestVersion;
        operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: () => {
                if (version !== this.requestVersion) return;
                this.saving = false;
                this.saved.emit();
                this.visibleChange.emit(false);
            },
            error: error => {
                if (version !== this.requestVersion) return;
                this.saving = false;
                this.error = this.errors.message(error);
                this.errors.apply(this.form, error);
            },
        });
    }

    private buildForm(record?: DictionaryRecord): FormGroup {
        const form = this.forms.create(this.schema!, record);
        if (this.readonly) form.disable();
        return form;
    }

    private initialize(): void {
        if (!this.schema) return;
        const version = ++this.requestVersion;
        this.error = '';
        this.loadingFailed = false;
        this.saving = false;
        this.activeTab.set('fields');
        this.form = this.buildForm();
        this.loading = !!this.recordId;
        if (!this.recordId) return;

        // Никогда не редактируем DTO из таблицы: всегда получаем свежий DTO с сервера.
        this.api.getRecord<DictionaryRecord>(this.code, this.recordId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: record => {
                    if (version !== this.requestVersion) return;
                    this.form = this.buildForm(record);
                    this.loading = false;
                },
                error: error => {
                    if (version !== this.requestVersion) return;
                    this.loading = false;
                    this.loadingFailed = true;
                    this.error = this.errors.message(error);
                },
            });
    }
}
