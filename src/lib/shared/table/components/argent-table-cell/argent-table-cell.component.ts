import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, TemplateRef, inject } from '@angular/core';
import { ArgentTableColumnDefinition } from '../../dto/argent-table.dto';
import { ArgentTableFormatService } from '../../service/argent-table-format.service';
import { ArgentTableFileCellComponent } from '../argent-table-file-cell/argent-table-file-cell.component';
import { ArgentTableRelationCellComponent } from '../argent-table-relation-cell/argent-table-relation-cell.component';
import { ArgentTableStatusCellComponent } from '../argent-table-status-cell/argent-table-status-cell.component';

/** Ячейка сама выбирает компактный визуальный компонент по типу. */
@Component({
    selector: 'argent-table-cell', standalone: true,
    imports: [NgTemplateOutlet, ArgentTableFileCellComponent, ArgentTableRelationCellComponent, ArgentTableStatusCellComponent],
    templateUrl: './argent-table-cell.component.html',
    styleUrl: './argent-table-cell.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArgentTableCellComponent {
    @Input() row: unknown;
    @Input({ required: true }) column!: ArgentTableColumnDefinition;
    @Input() customTemplate?: TemplateRef<{$implicit: unknown}>;

    @Output() binaryPreviewRequested = new EventEmitter<unknown>();

    private readonly format = inject(ArgentTableFormatService);

    get value(): unknown { return this.format.value(this.row, this.column.field); }
    get text(): string { return this.format.text(this.value, this.column); }
}
