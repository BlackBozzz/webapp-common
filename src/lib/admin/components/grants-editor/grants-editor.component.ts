import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { AbstractControl, ControlValueAccessor, FormsModule, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonDirective } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Chip } from 'primeng/chip';
import { Textarea } from 'primeng/textarea';
import type { Grants, TableOperation } from '../../../auth/dto/auth.dto';
import type { GrantsCatalog } from '../../dto/admin-roles.dto';

/** Ключ `tables`, означающий «любая таблица». */
const ANY_TABLE = '*';
/** Допустимые операции в порядке вывода. */
const OPERATIONS: readonly TableOperation[] = ['read', 'write'];
/** Форматы имён, которые принимает backend (`GrantsCodec`); на клиенте — только подсказка. */
const TABLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const ACTION_CODE_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_-]+)*$/;

/** Строка структурированного редактора: таблица и отмеченные операции. */
interface GrantRow {
    /** Локальный ключ для `@for`, не попадает в значение. */
    id: number;
    table: string;
    read: boolean;
    write: boolean;
}

/**
 * Приводит гранты к каноническому виду: таблицы без пустых имён и без пустых наборов операций,
 * отсортированы; операции в нижнем регистре, только `read`/`write`, без повторов, `read` первой;
 * действия без пустых и повторов, по алфавиту.
 */
export function normalizeGrants(grants: Partial<Grants> | null | undefined): Grants {
    const merged = new Map<string, Set<string>>();
    for (const [rawTable, rawOps] of Object.entries(grants?.tables ?? {})) {
        const table = rawTable.trim();
        if (!table) continue;
        const ops = merged.get(table) ?? new Set<string>();
        for (const op of rawOps ?? []) ops.add(String(op).trim().toLowerCase());
        merged.set(table, ops);
    }
    const tables: Record<string, string[]> = {};
    for (const table of [...merged.keys()].sort(compare)) {
        const ops = OPERATIONS.filter(op => merged.get(table)!.has(op));
        if (ops.length) tables[table] = ops;
    }
    const actions = [...new Set((grants?.actions ?? []).map(action => String(action).trim()).filter(Boolean))]
        .sort(compare);
    return { tables, actions };
}

/** Разбирает текст JSON в гранты (ещё не нормализованные) или возвращает текст ошибки для показа под полем. */
export function parseGrantsJson(text: string): { grants: Grants } | { error: string } {
    let raw: unknown;
    try {
        raw = text.trim() ? JSON.parse(text) : {};
    } catch {
        return { error: 'Некорректный JSON' };
    }
    if (!isObject(raw)) return { error: 'Гранты должны быть объектом { "tables": {...}, "actions": [...] }' };
    const unknownKey = Object.keys(raw).find(key => key !== 'tables' && key !== 'actions');
    if (unknownKey) return { error: `Неизвестное поле грантов: ${unknownKey}` };

    const tables: Record<string, string[]> = {};
    const rawTables = raw['tables'];
    if (rawTables !== undefined && rawTables !== null) {
        if (!isObject(rawTables)) return { error: '«tables» должно быть объектом «таблица → операции»' };
        for (const [table, ops] of Object.entries(rawTables)) {
            if (!Array.isArray(ops) || ops.some(op => typeof op !== 'string')) {
                return { error: `Операции таблицы «${table}» должны быть массивом строк` };
            }
            const wrong = (ops as string[]).find(op => !OPERATIONS.includes(op.trim().toLowerCase() as TableOperation));
            if (wrong !== undefined) return { error: `Недопустимая операция «${wrong}» (разрешены read, write)` };
            tables[table] = ops as string[];
        }
    }
    let actions: string[] = [];
    const rawActions = raw['actions'];
    if (rawActions !== undefined && rawActions !== null) {
        if (!Array.isArray(rawActions) || rawActions.some(action => typeof action !== 'string')) {
            return { error: '«actions» должно быть массивом строк' };
        }
        actions = rawActions as string[];
    }
    return { grants: { tables, actions } };
}

/**
 * Контрол формы для {@link Grants}: строки «таблица → read/write», действия и режим JSON.
 * Наружу отдаёт только нормализованное значение ({@link normalizeGrants}); некорректный JSON не отправляется.
 */
@Component({
    selector: 'argent-grants-editor',
    standalone: true,
    imports: [FormsModule, AutoComplete, ButtonDirective, Checkbox, Chip, Textarea],
    providers: [
        { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => GrantsEditorComponent), multi: true },
        { provide: NG_VALIDATORS, useExisting: forwardRef(() => GrantsEditorComponent), multi: true },
    ],
    templateUrl: './grants-editor.component.html',
    styleUrl: './grants-editor.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrantsEditorComponent implements ControlValueAccessor, Validator {
    /** Подсказки таблиц и действий (`GET /api/grants/catalog`); без каталога — свободный ввод. */
    readonly catalog = input<GrantsCatalog | null>(null);
    /** Префикс id элементов (если на странице несколько редакторов). */
    readonly inputId = input('argent-grants');

    protected readonly rows = signal<GrantRow[]>([]);
    protected readonly actions = signal<string[]>([]);
    protected readonly disabled = signal(false);
    protected readonly jsonMode = signal(false);
    protected readonly jsonText = signal('');
    protected readonly jsonError = signal('');
    /** Текст в поле нового действия. */
    protected readonly actionDraft = signal('');
    protected readonly tableSuggestions = signal<string[]>([]);
    protected readonly actionSuggestions = signal<string[]>([]);

    /** Текущее нормализованное значение, собранное из строк и действий. */
    protected readonly value = computed<Grants>(() => normalizeGrants({
        tables: this.rows().reduce<Record<string, string[]>>((tables, row) => {
            const table = row.table.trim();
            tables[table] = [...(tables[table] ?? []), ...OPERATIONS.filter(op => row[op])];
            return tables;
        }, {}),
        actions: this.actions(),
    }));

    private nextRowId = 0;
    private onChange: (value: Grants) => void = () => undefined;
    private onTouched: () => void = () => undefined;
    private onValidatorChange: () => void = () => undefined;

    writeValue(value: Grants | null): void {
        this.load(normalizeGrants(value));
        this.setJsonError('');
        if (this.jsonMode()) this.jsonText.set(this.stringify());
    }

    registerOnChange(fn: (value: Grants) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.disabled.set(isDisabled);
    }

    /** Пока в режиме JSON висит ошибка разбора, контрол невалиден — форму не сохранить со старыми грантами. */
    validate(_control: AbstractControl): ValidationErrors | null {
        const error = this.jsonError();
        return error ? { grantsJson: error } : null;
    }

    registerOnValidatorChange(fn: () => void): void {
        this.onValidatorChange = fn;
    }

    // ---- Таблицы ----

    /** Новая строка с отмеченным `read`; пока не задано имя таблицы, в значение она не попадает. */
    protected addRow(): void {
        this.rows.update(rows => [...rows, { id: this.nextRowId++, table: '', read: true, write: false }]);
    }

    protected removeRow(index: number): void {
        this.updateRows(rows => rows.filter((_, i) => i !== index));
    }

    protected setTable(index: number, table: string | null): void {
        this.updateRows(rows => rows.map((row, i) => i === index ? { ...row, table: table ?? '' } : row));
    }

    protected setOp(index: number, op: TableOperation, checked: boolean): void {
        this.updateRows(rows => rows.map((row, i) => i === index ? { ...row, [op]: checked } : row));
    }

    protected completeTable(event: AutoCompleteCompleteEvent): void {
        this.tableSuggestions.set(filterSuggestions([ANY_TABLE, ...(this.catalog()?.tables ?? [])], event.query));
    }

    /** Строка с таблицей, но без операций — в значение не попадёт, подсвечиваем. */
    protected rowHasNoOps(row: GrantRow): boolean {
        return row.table.trim() !== '' && !row.read && !row.write;
    }

    /** Имя таблицы не по формату backend — предупреждаем, но сохранять не мешаем (решает сервер). */
    protected tableNameSuspicious(row: GrantRow): boolean {
        const table = row.table.trim();
        return table !== '' && table !== ANY_TABLE && !TABLE_NAME_PATTERN.test(table);
    }

    /** Код действия не по формату backend — предупреждаем, сохранять не мешаем. */
    protected actionSuspicious(action: string): boolean {
        return !ACTION_CODE_PATTERN.test(action);
    }

    // ---- Действия ----

    protected addAction(action: string | null = this.actionDraft()): void {
        const code = (action ?? '').trim();
        this.actionDraft.set('');
        if (!code || this.actions().includes(code)) return;
        this.actions.update(actions => [...actions, code]);
        this.emit();
    }

    protected removeAction(action: string): void {
        this.actions.update(actions => actions.filter(item => item !== action));
        this.emit();
    }

    protected completeAction(event: AutoCompleteCompleteEvent): void {
        const taken = new Set(this.actions());
        this.actionSuggestions.set(
            filterSuggestions(this.catalog()?.actions ?? [], event.query).filter(action => !taken.has(action)));
    }

    /** Enter в поле действия добавляет введённый текст, если не выбрана подсказка. */
    protected actionKeydown(event: Event): void {
        if ((event as KeyboardEvent).key !== 'Enter') return;
        event.preventDefault();
        const input = event.target instanceof HTMLInputElement ? event.target : null;
        // Подсказка, выбранная стрелками, добавится через onSelect автокомплита.
        if (input?.getAttribute('aria-activedescendant')) return;
        this.addAction(input?.value ?? this.actionDraft());
        if (input) input.value = '';
    }

    // ---- JSON ----

    /** Переключает режим JSON; выйти из него можно только с корректным текстом. */
    protected toggleJson(): void {
        if (!this.jsonMode()) {
            this.jsonText.set(this.stringify());
            this.setJsonError('');
            this.jsonMode.set(true);
            return;
        }
        if (this.applyJson()) this.jsonMode.set(false);
    }

    protected setJsonText(text: string): void {
        this.jsonText.set(text);
    }

    /**
     * Разбирает текст JSON (по blur и при выходе из режима): корректный — заменяет строки
     * и действия и отправляет значение (`true`); некорректный — показывает ошибку, значение не меняется.
     */
    protected applyJson(): boolean {
        this.onTouched();
        const parsed = parseGrantsJson(this.jsonText());
        if ('error' in parsed) {
            this.setJsonError(parsed.error);
            return false;
        }
        this.setJsonError('');
        const before = JSON.stringify(this.value());
        this.load(normalizeGrants(parsed.grants));
        if (JSON.stringify(this.value()) !== before) this.emit();
        return true;
    }

    protected touch(): void {
        this.onTouched();
    }

    // ---- Служебное ----

    private load(grants: Grants): void {
        this.rows.set(Object.entries(grants.tables).map(([table, ops]) => ({
            id: this.nextRowId++,
            table,
            read: ops.includes('read'),
            write: ops.includes('write'),
        })));
        this.actions.set(grants.actions);
    }

    /** Меняет ошибку JSON и, если её наличие изменилось, просит форму перепроверить контрол. */
    private setJsonError(error: string): void {
        const changed = !!error !== !!this.jsonError();
        this.jsonError.set(error);
        if (changed) this.onValidatorChange();
    }

    private updateRows(change: (rows: GrantRow[]) => GrantRow[]): void {
        this.rows.update(change);
        this.emit();
    }

    private emit(): void {
        this.onChange(this.value());
    }

    private stringify(): string {
        return JSON.stringify(this.value(), null, 2);
    }
}

function compare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Подсказки, содержащие запрос (без учёта регистра); пустой запрос — все. */
function filterSuggestions(options: readonly string[], query: string): string[] {
    const needle = (query ?? '').trim().toLowerCase();
    return [...new Set(options)].filter(option => option.toLowerCase().includes(needle));
}
