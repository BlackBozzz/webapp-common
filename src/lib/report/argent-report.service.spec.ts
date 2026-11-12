import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ArgentReportService } from './argent-report.service';

describe('ArgentReportService', () => {
    it('fetches PDF with given parameters and auth-compatible HttpClient', () => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        const reports = TestBed.inject(ArgentReportService);
        const http = TestBed.inject(HttpTestingController);
        let received: Blob | undefined;
        reports.fetch('/api/reports/example', 'pdf', { id: 42, query: 'тест' })
            .subscribe(blob => received = blob);
        const request = http.expectOne(req => req.url === '/api/reports/example');
        expect(request.request.method).toBe('GET');
        expect(request.request.params.get('format')).toBe('pdf');
        expect(request.request.params.get('id')).toBe('42');
        expect(request.request.params.get('query')).toBe('тест');
        const blob = new Blob(['pdf'], { type: 'application/pdf' });
        request.flush(blob);
        expect(received).toBe(blob);
        http.verify();
    });

    it('show requests PDF even if the direct download format is Excel', () => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        const reports = TestBed.inject(ArgentReportService);
        const http = TestBed.inject(HttpTestingController);
        reports.show('/api/reports/example', { format: 'xlsx', title: 'Отчёт' });
        expect(reports.visible()).toBe(true);
        expect(reports.current()?.title).toBe('Отчёт');
        const request = http.expectOne(req => req.url === '/api/reports/example');
        expect(request.request.params.get('format')).toBe('pdf');
        reports.close();
        http.verify({ ignoreCancelled: true });
    });
});
