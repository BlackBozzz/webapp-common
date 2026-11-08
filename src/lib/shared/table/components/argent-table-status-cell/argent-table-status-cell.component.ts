import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { Tag } from 'primeng/tag';
import { ArgentTableColumnDefinition } from '../../dto/argent-table.dto';
import { ArgentTableFormatService } from '../../service/argent-table-format.service';

/** Статусная ячейка с пользовательскими подписями и цветами. */
@Component({
    selector: 'argent-table-status-cell', standalone: true,
    imports: [Tag], templateUrl: './argent-table-status-cell.component.html',
    styleUrl: './argent-table-status-cell.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArgentTableStatusCellComponent {
    @Input() value: unknown;
    @Input({ required: true }) column!: ArgentTableColumnDefinition;

    private readonly format = inject(ArgentTableFormatService);

    get label(): string { return this.format.text(this.value, this.column); }
    get severity(): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        return this.column.severityMap?.[String(this.value)] ?? 'secondary';
    }
}
