import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { ArgentTableComponent, ArgentTableColumnComponent, ArgentTableQuery } from '../../../../../shared/table';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { DynamicDictionarySchema, DynamicFieldDefinition, DynamicPage } from '../../../dto/dynamic-dictionary.dto';
import { DictionaryRecord } from '../../../service/dynamic-dictionary-form.service';
import { DynamicDictionaryDisplayService } from '../../../service/dynamic-dictionary-display.service';

/**
 * Таблица записей справочника с серверной пагинацией, сортировкой и фильтрами.
 * `lazyLoadOnInit=false`: первую страницу грузит страница-владелец, иначе запрос ушёл бы дважды.
 */
@Component({
    selector: 'argent-dictionary-record-table',
    standalone: true,
    imports: [ArgentTableComponent, ArgentTableColumnComponent],
    templateUrl: './dictionary-record-table.component.html',
    styleUrl: './dictionary-record-table.component.scss',
    changeDetection: ChangeDetectionStrategy.Default,
})
export class DictionaryRecordTableComponent {
    @Input({ required: true }) schema: DynamicDictionarySchema | null = null;
    @Input() page: DynamicPage<DictionaryRecord> | null = null;
    @Input() loading = false;
    @Input() selected: DictionaryRecord | null = null;
    @Input() filters: Readonly<Record<string, string>> = {};

    @Output() selectedChange = new EventEmitter<DictionaryRecord | null>();
    @Output() queryChange = new EventEmitter<TableLazyLoadEvent>();
    @Output() filterChange = new EventEmitter<{ field: string; value: string }>();

    private readonly display = inject(DynamicDictionaryDisplayService);

    get columns(): DynamicFieldDefinition[] {
        return (this.schema?.fields ?? []).filter(field => field.visible && field.control !== 'hidden')
            .sort((left, right) => left.order - right.order);
    }

    onTableQuery(query: ArgentTableQuery): void {
        this.queryChange.emit({
            first: query.page * query.size,
            rows: query.size,
            sortField: query.sort?.field,
            sortOrder: query.sort?.direction === 'desc' ? -1 : 1,
        });
        Object.entries(query.filters).forEach(([field, value]) =>
            this.filterChange.emit({ field, value: String(value ?? '') }));
    }

    show(value: unknown, field: DynamicFieldDefinition): string {
        return this.display.format(value, field);
    }

    sortable(field: DynamicFieldDefinition): boolean {
        return !field.reference && !['object', 'array', 'binary', 'bytes'].includes(field.type);
    }

    filterable(field: DynamicFieldDefinition): boolean {
        return this.sortable(field) && field.type !== 'boolean';
    }

    changeFilter(field: string, event: Event): void {
        this.filterChange.emit({ field, value: (event.target as HTMLInputElement).value });
    }
}
