import { ChangeDetectionStrategy, Component, ContentChild, Input } from '@angular/core';
import { ArgentTableCellDirective } from '../../directive/argent-table-cell.directive';
import { ArgentTableAlign, ArgentTableColumnDefinition, ArgentTableColumnType } from '../../dto/argent-table.dto';

/** Декларативная колонка: её описание считывает родительская таблица. */
@Component({
    selector: 'argent-table-column',
    standalone: true,
    templateUrl: './argent-table-column.component.html',
    styleUrl: './argent-table-column.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArgentTableColumnComponent {
    @Input({ required: true }) field = '';
    @Input() header = '';
    @Input() type: ArgentTableColumnType = 'string';
    @Input() width?: string;
    @Input() minWidth?: string;
    @Input() align: ArgentTableAlign = 'left';
    @Input() sortable = false;
    @Input() filterable = false;
    @Input() visible = true;
    @Input() frozen = false;
    @Input() truncate = true;
    @Input() emptyValue = '—';
    @Input() format?: string;
    @Input() currency = 'RUB';
    @Input() locale = 'ru-RU';
    @Input() decimalPlaces?: number;
    @Input() displayField?: string;
    @Input() separator = ', ';
    @Input() labelMap?: Readonly<Record<string, string>>;
    @Input() severityMap?: ArgentTableColumnDefinition['severityMap'];

    @ContentChild(ArgentTableCellDirective) cell?: ArgentTableCellDirective;

    get definition(): ArgentTableColumnDefinition {
        return {
            field: this.field, header: this.header || this.field, type: this.type,
            width: this.width, minWidth: this.minWidth, align: this.align,
            sortable: this.sortable, filterable: this.filterable, visible: this.visible,
            frozen: this.frozen, truncate: this.truncate, emptyValue: this.emptyValue,
            format: this.format, currency: this.currency, locale: this.locale,
            decimalPlaces: this.decimalPlaces, displayField: this.displayField,
            separator: this.separator, labelMap: this.labelMap, severityMap: this.severityMap,
        };
    }
}
