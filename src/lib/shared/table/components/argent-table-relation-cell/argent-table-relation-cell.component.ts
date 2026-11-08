import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { Chip } from 'primeng/chip';
import { ArgentTableColumnDefinition } from '../../dto/argent-table.dto';
import { ArgentTableFormatService } from '../../service/argent-table-format.service';

/** Связи: единичная подпись либо несколько компактных чипсов. */
@Component({
    selector: 'argent-table-relation-cell', standalone: true,
    imports: [Chip], templateUrl: './argent-table-relation-cell.component.html',
    styleUrl: './argent-table-relation-cell.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArgentTableRelationCellComponent {
    @Input() value: unknown;
    @Input({ required: true }) column!: ArgentTableColumnDefinition;

    private readonly format = inject(ArgentTableFormatService);

    get labels(): string[] {
        return Array.isArray(this.value)
            ? this.value.map(item => this.format.text(item, { ...this.column, type: 'relation' }))
            : this.value === null || this.value === undefined ? [] : [this.format.text(this.value, this.column)];
    }
}
