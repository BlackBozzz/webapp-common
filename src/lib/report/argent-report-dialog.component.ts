import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ButtonDirective } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { ArgentReportFormat, ArgentReportService } from './argent-report.service';

/** Разместите один раз в корневом layout: <argent-report-dialog />. */
@Component({
    selector: 'argent-report-dialog',
    standalone: true,
    imports: [Dialog, ButtonDirective],
    templateUrl: './argent-report-dialog.component.html',
    styleUrl: './argent-report-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArgentReportDialogComponent implements OnDestroy {
    readonly report = inject(ArgentReportService);
    private readonly sanitizer = inject(DomSanitizer);
    /** Безопасный iframe URL создаётся только из локального blob: после HttpClient-запроса. */
    protected readonly safeUrl = computed(() => {
        const url = this.report.previewUrl();
        return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
    });

    ngOnDestroy(): void {
        this.report.close();
    }

    protected download(format: ArgentReportFormat): void {
        this.report.downloadFromPreview(format);
    }
}
