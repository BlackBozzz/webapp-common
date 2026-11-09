import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IHeaderAngularComp } from 'ag-grid-angular';
import { Column, IHeaderParams } from 'ag-grid-community';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { ArgentTableFilterOption, ArgentTableFilterValue } from '../../dto/argent-table.dto';

/** Дополнительные параметры заголовка для встроенной фильтрации Argent. */
interface ArgentAgHeaderParams extends IHeaderParams {
    argentShowFilterRow: boolean;
    argentShowFilter: boolean;
    argentSortable: boolean;
    argentOptions: ArgentTableFilterOption[];
    argentFilterInputType: string;
    argentFilterPlaceholder: string;
    argentFilterInputValue: () => string;
    argentFilterValue: () => ArgentTableFilterValue | undefined;
    argentFilterChanged: (value: string | number | boolean | null) => void;
    argentFilterInput: (event: Event) => void;
}

/** Заголовок, в котором фильтр всегда совпадает по ширине и позиции с колонкой AG Grid. */
@Component({
    selector: 'argent-table-ag-header',
    standalone: true,
    imports: [FormsModule, InputText, Select],
    templateUrl: './argent-table-ag-header.component.html',
    styleUrl: './argent-table-ag-header.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArgentTableAgHeaderComponent implements IHeaderAngularComp, OnDestroy {
    private params!: ArgentAgHeaderParams;
    private listeningColumn?: Column;
    private readonly onSortChanged = () => this.updateSort();

    get title(): string {
        return this.params.displayName;
    }

    get showFilterRow(): boolean {
        return this.params.argentShowFilterRow;
    }

    get showFilter(): boolean {
        return this.params.argentShowFilter;
    }

    get sortable(): boolean {
        return this.params.argentSortable;
    }

    get options(): ArgentTableFilterOption[] {
        return this.params.argentOptions;
    }

    get inputType(): string {
        return this.params.argentFilterInputType;
    }

    get placeholder(): string {
        return this.params.argentFilterPlaceholder;
    }

    get inputValue(): string {
        return this.params.argentFilterInputValue();
    }

    get selectedValue(): string | number | boolean | null {
        const value = this.params.argentFilterValue();
        return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
            ? value : null;
    }

    get sortHint(): string {
        if (this.sortDirection === 'asc') return 'Сортировка по возрастанию. Нажмите для сортировки по убыванию';
        if (this.sortDirection === 'desc') return 'Сортировка по убыванию. Нажмите для отмены';
        return 'Сортировать по колонке';
    }

    sortDirection: 'asc' | 'desc' | null = null;

    constructor(private readonly cdr: ChangeDetectorRef) {}

    agInit(params: IHeaderParams): void {
        this.connect(params as ArgentAgHeaderParams);
    }

    refresh(params: IHeaderParams): boolean {
        this.connect(params as ArgentAgHeaderParams);
        return true;
    }

    ngOnDestroy(): void {
        this.listeningColumn?.removeEventListener('sortChanged', this.onSortChanged);
    }

    sortColumn(event: MouseEvent): void {
        this.params.progressSort(event.shiftKey);
        this.updateSort();
    }

    changeSelect(value: string | number | boolean | null): void {
        this.params.argentFilterChanged(value);
    }

    changeInput(event: Event): void {
        this.params.argentFilterInput(event);
    }

    private connect(params: ArgentAgHeaderParams): void {
        if (this.listeningColumn !== params.column) {
            this.listeningColumn?.removeEventListener('sortChanged', this.onSortChanged);
            this.listeningColumn = params.column;
            this.listeningColumn.addEventListener('sortChanged', this.onSortChanged);
        }
        this.params = params;
        this.updateSort();
    }

    private updateSort(): void {
        if (!this.params) return;
        const sort = this.params.column.getSort();
        this.sortDirection = sort === 'asc' || sort === 'desc' ? sort : null;
        this.cdr.markForCheck();
    }
}
