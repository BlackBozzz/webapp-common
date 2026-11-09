import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ArgentTableColumnDefinition } from '../../dto/argent-table.dto';

/** Бинарное содержимое не преобразуем в текст в табличных строках. */
@Component({
    selector: 'argent-table-file-cell',
    standalone: true,
    templateUrl: './argent-table-file-cell.component.html',
    styleUrl: './argent-table-file-cell.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArgentTableFileCellComponent {
    @Input() value: unknown;
    @Input({ required: true }) column!: ArgentTableColumnDefinition;

    @Output() previewRequested = new EventEmitter<unknown>();

    get hasFile(): boolean {
        if (this.value === null || this.value === undefined) return false;
        if (typeof this.value === 'string') return this.value.length > 0;
        if (Array.isArray(this.value)) return this.value.length > 0;
        return true;
    }
}
