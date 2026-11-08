import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../../auth/service/auth.store';
import { TableOperation } from '../../../../auth/dto/auth.dto';
import { DictionaryRecordDialogComponent } from '../../components/dialog/dictionary-record-dialog/dictionary-record-dialog.component';
import { DynamicDictionarySchema } from '../../dto/dynamic-dictionary.dto';
import { DynamicDictionaryApiService } from '../../service/dynamic-dictionary-api.service';
import { DictionaryRecordsPage } from './dictionary-records.page';

const SCHEMA: DynamicDictionarySchema = {
    code: 'dict_a',
    name: 'Справочник A',
    idField: 'id',
    displayField: null,
    fields: [],
};

const EXPORT_URL = '/api/export/dictionaries/dict_a';

describe('DictionaryRecordsPage', () => {
    let http: HttpTestingController;
    let fixture: ComponentFixture<DictionaryRecordsPage> | undefined;
    let downloads: string[];
    let createUrl: ReturnType<typeof vi.fn>;
    const originalCreateUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevokeUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

    beforeEach(() => {
        // jsdom без ResizeObserver (p-tablist в диалоге записи) и без URL.createObjectURL (скачивание).
        vi.stubGlobal('ResizeObserver', class {
            observe(): void { /* заглушка */ }
            unobserve(): void { /* заглушка */ }
            disconnect(): void { /* заглушка */ }
        });
        createUrl = vi.fn(() => 'blob:export');
        Object.defineProperty(URL, 'createObjectURL', { value: createUrl, configurable: true, writable: true });
        Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
        downloads = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            downloads.push(this.download);
        });

        TestBed.configureTestingModule({
            imports: [DictionaryRecordsPage],
            providers: [
                provideRouter([]),
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ code: 'dict_a' })) } },
                {
                    provide: DynamicDictionaryApiService,
                    useValue: {
                        getSchema: () => of(SCHEMA),
                        getRecords: () => of({
                            items: [], page: 0, size: 20, totalElements: 0, totalPages: 0, first: true, last: true,
                        }),
                        getRecord: () => of({ id: '7' }),
                    },
                },
            ],
        });
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        http.verify();
        fixture?.destroy();
        fixture = undefined;
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        restore('createObjectURL', originalCreateUrl);
        restore('revokeObjectURL', originalRevokeUrl);
    });

    function restore(name: 'createObjectURL' | 'revokeObjectURL', descriptor: PropertyDescriptor | undefined): void {
        if (descriptor) {
            Object.defineProperty(URL, name, descriptor);
        } else {
            delete (URL as unknown as Record<string, unknown>)[name];
        }
    }

    function create(ops: TableOperation[], actions: string[]): HTMLElement {
        TestBed.inject(AuthStore).user.set({
            id: '1',
            login: 'ivan',
            displayName: 'Иван',
            grants: { tables: { dict_a: ops }, actions },
        });
        fixture = TestBed.createComponent(DictionaryRecordsPage);
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    function pageMessages(): MessageService {
        return fixture!.debugElement.injector.get(MessageService);
    }

    function clickExport(element: HTMLElement, format: 'xlsx' | 'csv'): void {
        (element.querySelector(`.argent-records__export-${format}`) as HTMLButtonElement).click();
    }

    it('shows export for reader and import only with import action and write', () => {
        let element = create(['read'], []);
        expect(element.querySelector('.argent-records__export-xlsx')).not.toBeNull();
        expect(element.querySelector('.argent-records__export-csv')).not.toBeNull();
        expect(element.querySelector('.argent-records__import')).toBeNull();
        fixture!.destroy();

        element = create(['read', 'write'], []);
        expect(element.querySelector('.argent-records__import')).toBeNull();
        fixture!.destroy();

        element = create(['write'], ['import']);
        expect(element.querySelector('.argent-records__export-xlsx')).toBeNull();
        expect(element.querySelector('.argent-records__import')).not.toBeNull();
    });

    it('downloads xlsx on click', () => {
        const element = create(['read'], []);

        clickExport(element, 'xlsx');

        const request = http.expectOne(r => r.url === EXPORT_URL);
        expect(request.request.method).toBe('GET');
        expect(request.request.params.get('format')).toBe('xlsx');
        request.flush(new Blob(['x']), {
            headers: { 'Content-Disposition': "attachment; filename*=UTF-8''%D0%A1%D0%BF%D1%80.xlsx" },
        });

        expect(createUrl).toHaveBeenCalled();
        expect(downloads).toEqual(['Спр.xlsx']);
    });

    it('falls back to code-based file name without Content-Disposition', () => {
        const element = create(['read'], []);

        clickExport(element, 'csv');

        http.expectOne(r => r.url === EXPORT_URL && r.params.get('format') === 'csv').flush(new Blob(['x']));
        expect(downloads).toEqual(['dict_a.csv']);
    });

    it('shows backend detail from blob body on export error', async () => {
        const element = create(['read'], []);
        const add = vi.spyOn(pageMessages(), 'add');

        clickExport(element, 'xlsx');
        http.expectOne(r => r.url === EXPORT_URL).flush(
            new Blob([JSON.stringify({ status: 500, detail: 'Выгрузка сломалась' })], { type: 'application/problem+json' }),
            { status: 500, statusText: 'Error' },
        );

        await vi.waitFor(() => expect(add).toHaveBeenCalledWith(expect.objectContaining({
            severity: 'error', summary: 'Экспорт не выполнен', detail: 'Выгрузка сломалась',
        })));
        expect(downloads).toEqual([]);
    });

    it('does not add own toast on export 403', async () => {
        const element = create(['read'], []);
        const add = vi.spyOn(pageMessages(), 'add');

        clickExport(element, 'xlsx');
        http.expectOne(r => r.url === EXPORT_URL).flush(
            new Blob([JSON.stringify({ status: 403, detail: 'Нет доступа' })]),
            { status: 403, statusText: 'Forbidden' },
        );
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(add).not.toHaveBeenCalled();
    });

    it('renders argent toast for attachments error inside record dialog', async () => {
        create(['read', 'write'], []);
        const page = fixture!.componentInstance;
        page.editingId.set('7');
        page.dialogVisible.set(true);
        fixture!.detectChanges();
        const dialog = fixture!.debugElement.query(By.directive(DictionaryRecordDialogComponent))
            .componentInstance as DictionaryRecordDialogComponent;
        dialog.activeTab.set('files');
        fixture!.detectChanges();

        http.expectOne(r => r.url === '/api/attachments').flush(
            { status: 500, detail: 'Хранилище недоступно' },
            { status: 500, statusText: 'Error' },
        );
        fixture!.detectChanges();

        await vi.waitFor(() => {
            fixture!.detectChanges();
            expect(document.body.querySelector('p-toast[key="argent"]')?.textContent).toContain('Хранилище недоступно');
        });
    });
    function buttonLabels(element: HTMLElement): string[] {
        return Array.from(element.querySelectorAll('.argent-records__actions button'))
            .map(button => button.textContent?.trim() ?? '');
    }

    it('reader sees Open instead of Edit and opens record dialog in readonly mode', () => {
        const element = create(['read'], []);
        const labels = buttonLabels(element);
        expect(labels).toContain('Открыть');
        expect(labels).not.toContain('Редактировать');

        const page = fixture!.componentInstance;
        page.selected.set({ id: '7' });
        fixture!.detectChanges();
        (element.querySelector('.argent-records__open') as HTMLButtonElement).click();
        fixture!.detectChanges();

        expect(page.editingId()).toBe('7');
        expect(page.dialogVisible()).toBe(true);
        const dialog = fixture!.debugElement.query(By.directive(DictionaryRecordDialogComponent))
            .componentInstance as DictionaryRecordDialogComponent;
        expect(dialog.readonly).toBe(true);
    });

    it('writer sees Edit and no Open', () => {
        const element = create(['read', 'write'], []);
        const labels = buttonLabels(element);
        expect(labels).toContain('Редактировать');
        expect(labels).not.toContain('Открыть');
        const dialog = fixture!.debugElement.query(By.directive(DictionaryRecordDialogComponent))
            .componentInstance as DictionaryRecordDialogComponent;
        expect(dialog.readonly).toBe(false);
    });

    it('positions argent toast bottom-right', () => {
        const element = create(['read'], []);
        const toast = fixture!.debugElement.queryAll(By.css('p-toast'))
            .find(node => node.attributes['key'] === 'argent');
        expect(toast?.componentInstance.position).toBe('bottom-right');
        expect(element).toBeTruthy();
    });
});
