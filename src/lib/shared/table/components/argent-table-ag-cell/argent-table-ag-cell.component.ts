import { ChangeDetectionStrategy, ChangeDetectorRef, Component, TemplateRef } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';
import { ArgentTableColumnDefinition } from '../../dto/argent-table.dto';
import { ArgentTableCellComponent } from '../argent-table-cell/argent-table-cell.component';

interface ArgentAgCellParams extends ICellRendererParams {
    definition: ArgentTableColumnDefinition;
    template?: TemplateRef<{ $implicit: unknown }>;
    preview: (value: unknown) => void;
}

/** Адаптер: одна виртуальная ячейка AG Grid использует существующий рендерер Argent. */
@Component({
    selector: 'argent-table-ag-cell',
    standalone: true,
    imports: [ArgentTableCellComponent],
    templateUrl: './argent-table-ag-cell.component.html',
    styleUrl: './argent-table-ag-cell.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArgentTableAgCellComponent implements ICellRendererAngularComp {
    row: unknown;
    column!: ArgentTableColumnDefinition;
    template?: TemplateRef<{ $implicit: unknown }>;

    private preview?: (value: unknown) => void;

    constructor(private readonly cdr: ChangeDetectorRef) {}

    agInit(params: ICellRendererParams): void {
        const typed = params as ArgentAgCellParams;
        this.row = typed.data;
        this.column = typed.definition;
        this.template = typed.template;
        this.preview = typed.preview;
    }

    refresh(params: ICellRendererParams): boolean {
        this.agInit(params);
        this.cdr.markForCheck();
        return true;
    }

    openPreview(value: unknown): void {
        this.preview?.(value);
    }
}
