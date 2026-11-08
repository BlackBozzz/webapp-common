import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { ArgentTableColumnDefinition } from '../../dto/argent-table.dto';
import { ArgentTableFormatService } from '../../service/argent-table-format.service';

/** Файл отображается как название; ссылки на произвольные адреса автоматически не открываем. */
@Component({
    selector: 'argent-table-file-cell', standalone: true,
    templateUrl: './argent-table-file-cell.component.html',
    styleUrl: './argent-table-file-cell.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArgentTableFileCellComponent {
    @Input() value: unknown;
    @Input({ required: true }) column!: ArgentTableColumnDefinition;

    private readonly format = inject(ArgentTableFormatService);

    get label(): string { return this.format.text(this.value, this.column); }
}
