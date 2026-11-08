import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, TemplateRef, ViewChild } from '@angular/core';
import { ButtonDirective } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { ArgentTableExportFormat } from '../../dto/argent-table.dto';

/** Единый тулбар: стандартные действия всегда справа сверху. */
@Component({
    selector: 'argent-table-toolbar',
    standalone: true,
    imports: [ButtonDirective, Menu, NgTemplateOutlet],
    templateUrl: './argent-table-toolbar.component.html',
    styleUrl: './argent-table-toolbar.component.scss',
    changeDetection: ChangeDetectionStrategy.Default,
})
export class ArgentTableToolbarComponent {
    @Input() title = '';
    @Input() totalRecords?: number;
    @Input() loading = false;
    @Input() showRefresh = true;
    @Input() showExport = true;
    @Input() showImport = false;
    @Input() exportDisabled = false;
    @Input() importDisabled = false;
    @Input() exportFormats: readonly ArgentTableExportFormat[] = ['xlsx', 'csv'];
    @Input() startTemplate?: TemplateRef<unknown>;
    @Input() endTemplate?: TemplateRef<unknown>;

    @Output() refreshRequested = new EventEmitter<void>();
    @Output() exportRequested = new EventEmitter<ArgentTableExportFormat>();
    @Output() importRequested = new EventEmitter<void>();

    @ViewChild('exportMenu') exportMenu?: Menu;

    get exportItems(): MenuItem[] {
        return this.exportFormats.map(format => ({
            label: format.toUpperCase(),
            icon: format === 'xlsx' ? 'pi pi-file-excel' : 'pi pi-file',
            command: () => this.exportRequested.emit(format),
        }));
    }

    openExport(event: Event): void {
        this.exportMenu?.toggle(event);
    }
}
