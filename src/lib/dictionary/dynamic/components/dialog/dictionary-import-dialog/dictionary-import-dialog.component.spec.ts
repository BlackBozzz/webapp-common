import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DictionaryImportDialogComponent } from './dictionary-import-dialog.component';

const IMPORT_URL = '/api/import/dictionaries/dict_a';

describe('DictionaryImportDialogComponent', () => {
    let http: HttpTestingController;
    let fixture: ComponentFixture<DictionaryImportDialogComponent>;
    let imported: number;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [DictionaryImportDialogComponent],
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        http = TestBed.inject(HttpTestingController);
        fixture = TestBed.createComponent(DictionaryImportDialogComponent);
        fixture.componentRef.setInput('code', 'dict_a');
        fixture.componentRef.setInput('visible', true);
        imported = 0;
        fixture.componentInstance.imported.subscribe(() => imported++);
        fixture.detectChanges();
    });

    afterEach(() => {
        http.verify();
        fixture.destroy();
    });

    function text(): string {
        return document.body.textContent ?? '';
    }

    function errorRows(): number {
        return document.body.querySelectorAll('.argent-import-dialog__errors tbody tr').length;
    }

    function startImport(mode: 'UPSERT' | 'REPLACE' = 'UPSERT'): void {
        const component = fixture.componentInstance;
        component.selectFile(new File(['x'], 'data.xlsx'));
        component.mode.set(mode);
        component.submit();
        fixture.detectChanges();
    }

    it('posts file with mode UPSERT', () => {
        startImport();

        const request = http.expectOne(IMPORT_URL);
        expect(request.request.method).toBe('POST');
        const body = request.request.body as FormData;
        expect((body.get('file') as File).name).toBe('data.xlsx');
        expect(body.get('mode')).toBe('UPSERT');
        request.flush({ total: 2, created: 1, updated: 1, failed: 0, errors: [] });
        fixture.detectChanges();

        expect(imported).toBe(1);
        expect(fixture.componentInstance.report()?.created).toBe(1);
    });

    it('shows warning for REPLACE mode', () => {
        expect(text()).not.toContain('Все записи справочника будут заменены');

        fixture.componentInstance.mode.set('REPLACE');
        fixture.detectChanges();

        expect(text()).toContain('Все записи справочника будут заменены');
    });

    it('renders report with errors', () => {
        startImport();
        http.expectOne(IMPORT_URL).flush({
            total: 5, created: 2, updated: 1, failed: 2,
            errors: [
                { row: 3, field: 'name', message: 'Обязательное поле' },
                { row: 4, field: null, message: 'Неверный формат строки' },
            ],
        });
        fixture.detectChanges();

        expect(errorRows()).toBe(2);
        expect(text()).toContain('Обязательное поле');
        expect(text()).toContain('Неверный формат строки');
        expect(document.body.querySelector('.argent-import-dialog__summary')?.textContent)
            .toContain('С ошибками: 2');
    });

    it('shows dash for sheet-level error with row 0', () => {
        startImport();
        http.expectOne(IMPORT_URL).flush({
            total: 0, created: 0, updated: 0, failed: 1,
            errors: [{ row: 0, field: null, message: 'Лист не найден' }],
        });
        fixture.detectChanges();

        const cells = Array.from(document.body.querySelectorAll('td')).map(td => td.textContent?.trim());
        expect(cells).toContain('Лист не найден');
        expect(cells[cells.indexOf('Лист не найден') - 2]).toBe('—');
    });

    it('shows report from 400 body', () => {
        startImport();
        http.expectOne(IMPORT_URL).flush({
            status: 400,
            detail: 'Импорт отменён: в данных есть ошибки',
            report: {
                total: 2, created: 0, updated: 0, failed: 1,
                errors: [{ row: 2, field: 'code', message: 'Дубликат кода' }],
            },
        }, { status: 400, statusText: 'Bad Request' });
        fixture.detectChanges();

        expect(errorRows()).toBe(1);
        expect(text()).toContain('Дубликат кода');
        expect(text()).toContain('Импорт отменён: в данных есть ошибки');
        expect(imported).toBe(0);
    });

    it('resets state when reopened or code changes', () => {
        const component = fixture.componentInstance;
        function dirty(): void {
            component.selectFile(new File(['x'], 'data.csv'));
            component.mode.set('REPLACE');
            component.report.set({ total: 1, created: 1, updated: 0, failed: 0, errors: [] });
            component.error.set('Ошибка');
        }
        function expectClean(): void {
            expect(component.file()).toBeNull();
            expect(component.mode()).toBe('UPSERT');
            expect(component.report()).toBeNull();
            expect(component.error()).toBe('');
        }

        dirty();
        fixture.componentRef.setInput('visible', false);
        fixture.detectChanges();
        fixture.componentRef.setInput('visible', true);
        fixture.detectChanges();
        expectClean();

        dirty();
        fixture.componentRef.setInput('code', 'dict_b');
        fixture.detectChanges();
        expectClean();
    });

    it('shows backend error for unsupported file', () => {
        startImport();
        http.expectOne(IMPORT_URL).flush(
            { status: 400, detail: 'Не удалось прочитать файл XLSX' },
            { status: 400, statusText: 'Bad Request' },
        );
        fixture.detectChanges();

        expect(fixture.componentInstance.report()).toBeNull();
        expect(text()).toContain('Не удалось прочитать файл XLSX');
    });
});
