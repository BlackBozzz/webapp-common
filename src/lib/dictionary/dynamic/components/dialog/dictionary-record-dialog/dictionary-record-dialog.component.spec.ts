import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamicDictionarySchema } from '../../../dto/dynamic-dictionary.dto';
import { DynamicDictionaryApiService } from '../../../service/dynamic-dictionary-api.service';
import { AttachmentsComponent } from '../../../../../attachments/components/attachments/attachments.component';
import { DictionaryRecordDialogComponent } from './dictionary-record-dialog.component';

const SCHEMA: DynamicDictionarySchema = {
    code: 'dict_a',
    name: 'Справочник A',
    idField: 'id',
    displayField: null,
    fields: [],
};

describe('DictionaryRecordDialogComponent', () => {
    let http: HttpTestingController;
    let fixture: ComponentFixture<DictionaryRecordDialogComponent>;

    beforeEach(() => {
        // jsdom без ResizeObserver, а p-tablist подписывается на изменение размеров.
        vi.stubGlobal('ResizeObserver', class {
            observe(): void { /* заглушка */ }
            unobserve(): void { /* заглушка */ }
            disconnect(): void { /* заглушка */ }
        });
        TestBed.configureTestingModule({
            imports: [DictionaryRecordDialogComponent],
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                MessageService,
                { provide: DynamicDictionaryApiService, useValue: { getRecord: () => of({ id: '7' }) } },
            ],
        });
        http = TestBed.inject(HttpTestingController);
        fixture = TestBed.createComponent(DictionaryRecordDialogComponent);
    });

    afterEach(() => {
        fixture.destroy();
        vi.unstubAllGlobals();
    });

    function open(recordId: string | null): HTMLElement {
        fixture.componentRef.setInput('code', 'dict_a');
        fixture.componentRef.setInput('schema', SCHEMA);
        fixture.componentRef.setInput('recordId', recordId);
        fixture.componentRef.setInput('visible', true);
        fixture.detectChanges();
        return document.body;
    }

    function tabLabels(root: HTMLElement): string[] {
        return Array.from(root.querySelectorAll('p-tab')).map(tab => tab.textContent?.trim() ?? '');
    }

    it('shows tabs Files and History only when editing', () => {
        let root = open(null);
        expect(tabLabels(root)).toEqual([]);
        expect(root.querySelector('argent-attachments')).toBeNull();

        fixture.componentRef.setInput('visible', false);
        fixture.detectChanges();
        root = open('7');

        expect(tabLabels(root)).toEqual(['Поля', 'Файлы', 'История']);
        expect(root.querySelector('argent-dictionary-dynamic-form')).not.toBeNull();
        fixture.componentInstance.activeTab.set('files');
        fixture.detectChanges();
        expect(root.querySelector('argent-attachments')).not.toBeNull();

        fixture.componentInstance.activeTab.set('history');
        fixture.detectChanges();
        expect(root.querySelector('argent-audit-log')).not.toBeNull();
        // Без грантов вложения и история не делают запросов — проверяем только вкладки.
        http.verify();
    });

    it('hides save button outside Fields tab', () => {
        const root = open('7');
        expect(root.querySelector('.argent-record-dialog__save')).not.toBeNull();

        fixture.componentInstance.activeTab.set('files');
        fixture.detectChanges();
        expect(root.querySelector('.argent-record-dialog__save')).toBeNull();
        expect(root.textContent).toContain('Отмена');

        fixture.componentInstance.activeTab.set('fields');
        fixture.detectChanges();
        expect(root.querySelector('.argent-record-dialog__save')).not.toBeNull();
    });
    it('readonly mode disables form, hides save and passes readonly to attachments', () => {
        fixture.componentRef.setInput('readonly', true);
        const root = open('7');

        expect(fixture.componentInstance.form.disabled).toBe(true);
        expect(root.querySelector('.argent-record-dialog__save')).toBeNull();
        expect(root.textContent).toContain('Закрыть');
        expect(root.textContent).not.toContain('Отмена');
        expect(fixture.componentInstance.heading).toBe('Просмотр записи');
        expect(tabLabels(root)).toEqual(['Поля', 'Файлы', 'История']);

        fixture.componentInstance.activeTab.set('files');
        fixture.detectChanges();
        const attachments = fixture.debugElement.query(By.directive(AttachmentsComponent));
        expect(attachments).not.toBeNull();
        expect((attachments.componentInstance as AttachmentsComponent).readonly()).toBe(true);
        http.verify();
    });

    it('editing mode passes readonly=false to attachments', () => {
        const root = open('7');
        expect(fixture.componentInstance.form.disabled).toBe(false);
        fixture.componentInstance.activeTab.set('files');
        fixture.detectChanges();
        const attachments = fixture.debugElement.query(By.directive(AttachmentsComponent));
        expect((attachments.componentInstance as AttachmentsComponent).readonly()).toBe(false);
        expect(root).toBeTruthy();
    });
});
