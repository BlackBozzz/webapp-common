import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

type DocsTab = 'endpoints' | 'dto' | 'database' | 'swagger' | 'deploy';
type ModelCategory = 'Запросы' | 'Ответы' | 'Общие модели' | 'Перечисления';
type ApiField = { name: string; title: string; description: string; type: string; reference: string | null; required: boolean; example?: unknown; readOnly?: boolean };
type RoleView = { code: string; name: string };
type EndpointAccess = { method: string; path: string; action: string; roles: RoleView[] };
type Operation = {
    method: string; path: string; summary: string; description: string; tags: string[];
    action: string; roles: RoleView[]; parameters: { name: string; location: string; description: string; required: boolean }[];
    responses: { status: string; description: string; models: string[] }[];
    requestModels: string[]; responseModels: string[];
};
type Model = { name: string; title: string; description: string; source: string; group: string; table: string; category: ModelCategory; fields: ApiField[]; linked: string[]; enumValues: string[] };
type DbColumn = { name: string; title: string; description: string; type: string; nullable: boolean; primaryKey: boolean };
type DbTable = { name: string; title: string; description: string; group: string; columns: DbColumn[]; relations: { fromColumn: string; toTable: string; toColumn: string }[] };
type DbResponse = { schema: string; tables: DbTable[] };
type DtoResponse = { name: string; javaClass: string; table: string; title?: string; description?: string; group?: string; fields: { name: string; title?: string; description?: string; type: string; readOnly: boolean; required?: boolean; example?: string }[] };
type ApiSchema = { type?: string; format?: string; title?: string; description?: string; example?: unknown; enum?: string[]; $ref?: string; properties?: Record<string, ApiSchema>; required?: string[]; items?: ApiSchema; additionalProperties?: ApiSchema | boolean; allOf?: ApiSchema[]; oneOf?: ApiSchema[]; anyOf?: ApiSchema[]; readOnly?: boolean };
type ApiOperation = {
    summary?: string; description?: string; tags?: string[];
    parameters?: { name?: string; in?: string; description?: string; required?: boolean }[];
    requestBody?: { content?: Record<string, { schema?: ApiSchema }> };
    responses?: Record<string, { description?: string; content?: Record<string, { schema?: ApiSchema }> }>;
    'x-argent-action'?: string;
    'x-argent-roles'?: RoleView[];
};
type ApiDoc = { info?: { title?: string; version?: string }; paths?: Record<string, Record<string, ApiOperation>>; components?: { schemas?: Record<string, ApiSchema> } };

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
const CATEGORY_ORDER: ModelCategory[] = ['Запросы', 'Ответы', 'Общие модели', 'Перечисления'];
const label = (value: string | undefined, fallback: string): string => value?.trim() || fallback;
const lower = (value: string): string => value.toLocaleLowerCase('ru');

function refName(ref?: string): string | null {
    return ref ? ref.split('/').at(-1) ?? null : null;
}
function linkedName(schema?: ApiSchema): string | null {
    if (!schema) return null;
    return refName(schema.$ref) || linkedName(schema.items)
        || schema.allOf?.map(linkedName).find(Boolean) || schema.oneOf?.map(linkedName).find(Boolean)
        || schema.anyOf?.map(linkedName).find(Boolean) || null;
}
function typeName(schema: ApiSchema): string {
    if (schema.type === 'array') return `Список<${linkedName(schema.items) ?? schema.items?.type ?? 'object'}>`;
    if (schema.additionalProperties) return 'Словарь';
    return linkedName(schema) || [schema.type || 'object', schema.format].filter(Boolean).join(' / ');
}
function collectRefs(schema?: ApiSchema): string[] {
    if (!schema) return [];
    const refs = new Set<string>();
    const visit = (node: ApiSchema | undefined, depth: number): void => {
        if (!node || depth > 8) return;
        const name = refName(node.$ref);
        if (name) refs.add(name);
        visit(node.items, depth + 1);
        if (node.additionalProperties && typeof node.additionalProperties === 'object') visit(node.additionalProperties, depth + 1);
        for (const item of [...node.allOf ?? [], ...node.oneOf ?? [], ...node.anyOf ?? []]) visit(item, depth + 1);
        for (const item of Object.values(node.properties ?? {})) visit(item, depth + 1);
    };
    visit(schema, 0);
    return [...refs];
}
function mediaModels(content: Record<string, { schema?: ApiSchema }> | undefined,
                     knownSchemas: Record<string, ApiSchema>): string[] {
    const found = new Set<string>(Object.values(content ?? {}).flatMap(item => collectRefs(item.schema)));
    const queue = [...found];
    // Показываем не только Page<UserDto>, но и вложенный UserDto, на который ссылается Page.
    for (let index = 0; index < queue.length && index < 120; index++) {
        const name = queue[index];
        const schema = knownSchemas[name];
        if (!schema) continue;
        for (const ref of collectRefs(schema)) {
            if (!found.has(ref)) { found.add(ref); queue.push(ref); }
        }
    }
    return [...found];
}
function rolesFromSpec(op: ApiOperation): RoleView[] {
    return Array.isArray(op['x-argent-roles']) ? op['x-argent-roles'] : [];
}

/** Русскоязычный каталог API, DTO и БД. Глобальные ER-графы заменены поиском и локальными связями. */
@Component({
    selector: 'argent-admin-api-docs',
    standalone: true,
    imports: [],
    templateUrl: './admin-api-docs.page.html',
    styleUrl: './admin-api-docs.page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminApiDocsPage {
    private readonly http = inject(HttpClient);
    private readonly destroyRef = inject(DestroyRef);

    readonly activeTab = signal<DocsTab>('endpoints');
    readonly search = signal('');
    readonly selectedTag = signal('');
    readonly selectedRole = signal('');
    readonly selectedMethod = signal('');
    readonly selectedAction = signal('');
    readonly selectedGroup = signal('');
    readonly selectedCategory = signal<ModelCategory | ''>('');
    readonly selectedModelName = signal('');
    readonly selectedTableName = signal('');
    readonly api = signal<ApiDoc | null>(null);
    readonly database = signal<DbResponse | null>(null);
    readonly annotatedDtos = signal<DtoResponse[]>([]);
    readonly accessList = signal<EndpointAccess[]>([]);
    readonly apiError = signal('');
    readonly schemaError = signal('');
    readonly dtoError = signal('');
    readonly swaggerUrl = '/swagger-ui/index.html';
    readonly modelCategories = CATEGORY_ORDER;

    readonly tableCount = computed(() => this.database()?.tables.length || 0);
    readonly operations = computed<Operation[]>(() => {
        const knownSchemas = this.api()?.components?.schemas ?? {};
        const access = new Map(this.accessList().map(entry => [`${entry.method} ${entry.path}`, entry]));
        const result: Operation[] = [];
        for (const [path, methods] of Object.entries(this.api()?.paths ?? {})) {
            for (const [method, op] of Object.entries(methods)) {
                if (!METHODS.includes(method)) continue;
                const httpMethod = method.toUpperCase();
                const live = access.get(`${httpMethod} ${path}`) ?? access.get(`* ${path}`);
                const action = live?.action || op['x-argent-action'] || '';
                result.push({ method: httpMethod, path, summary: op.summary || '',
                    description: (op.description || '').split('**Доступ (действие):**')[0].trim(), tags: op.tags || [], action,
                    roles: live?.roles || rolesFromSpec(op),
                    parameters: (op.parameters || []).map(param => ({ name: param.name || '',
                        location: param.in || 'query', description: param.description || '',
                        required: !!param.required })),
                    requestModels: mediaModels(op.requestBody?.content, knownSchemas),
                    responseModels: [...new Set(Object.values(op.responses || {}).flatMap(response => mediaModels(response.content, knownSchemas)))],
                    responses: Object.entries(op.responses || {}).map(([status, response]) => ({
                        status, description: response.description || '', models: mediaModels(response.content, knownSchemas),
                    })),
                });
            }
        }
        return result.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    });
    readonly tags = computed(() => [...new Set(this.operations().flatMap(x => x.tags))].sort());
    readonly actions = computed(() => [...new Set(this.operations().map(x => x.action).filter(Boolean))].sort());
    readonly allRoles = computed(() => [...new Map(this.operations().flatMap(op => op.roles).map(role => [role.code, role])).values()].sort((a,b) => a.name.localeCompare(b.name, 'ru')));
    readonly visibleOperations = computed(() => {
        const q = lower(this.search().trim());
        return this.operations().filter(op => (!this.selectedTag() || op.tags.includes(this.selectedTag()))
            && (!this.selectedMethod() || op.method === this.selectedMethod())
            && (!this.selectedAction() || op.action === this.selectedAction())
            && (!this.selectedRole() || op.roles.some(role => role.code === this.selectedRole()))
            && (!q || [op.method, op.path, op.summary, op.description, op.action, ...op.tags,
                ...op.roles.flatMap(role => [role.name, role.code]),
                ...op.parameters.flatMap(param => [param.name, param.description])]
                .some(text => lower(text).includes(q))));
    });
    readonly models = computed<Model[]>(() => {
        const requestNames = new Set(this.operations().flatMap(op => op.requestModels));
        const responseNames = new Set(this.operations().flatMap(op => op.responseModels));
        const annotated = new Map(this.annotatedDtos().map(dto => [dto.name, dto]));
        const result: Model[] = [];
        const seen = new Set<string>();
        for (const [name, schema] of Object.entries(this.api()?.components?.schemas || {})) {
            seen.add(name);
            const extra = annotated.get(name);
            const props = { ...schema.properties };
            for (const extension of schema.allOf || []) Object.assign(props, extension.properties || {});
            const required = new Set(schema.required || []);
            result.push({ name, title: label(schema.title, label(extra?.title, name)),
                description: label(schema.description, extra?.description || ''),
                group: extra?.group || '', table: extra?.table || '', source: 'OpenAPI',
                category: this.categoryFor(name, !!schema.enum, requestNames, responseNames),
                enumValues: schema.enum || [], fields: Object.entries(props).map(([key, field]) => ({
                    name: key, title: label(field.title, extra?.fields.find(f => f.name === key)?.title || key),
                    description: label(field.description, extra?.fields.find(f => f.name === key)?.description || ''),
                    type: typeName(field), reference: linkedName(field), required: required.has(key),
                    example: field.example, readOnly: field.readOnly,
                })), linked: [...new Set(Object.values(props).flatMap(collectRefs))],
            });
        }
        for (const dto of this.annotatedDtos()) {
            if (seen.has(dto.name)) continue;
            result.push({ name: dto.name, title: label(dto.title, dto.name), description: dto.description || '',
                group: dto.group || '', table: dto.table || '', source: 'DTO приложения',
                category: this.categoryFor(dto.name, false, requestNames, responseNames),
                fields: dto.fields.map(field => ({ name: field.name, title: label(field.title, field.name),
                    description: field.description || '', type: field.type, reference: null,
                    required: !!field.required, example: field.example, readOnly: field.readOnly })), linked: [], enumValues: [],
            });
        }
        return result.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    });
    readonly visibleModels = computed(() => {
        const q = lower(this.search().trim());
        return this.models().filter(model => (!this.selectedCategory() || model.category === this.selectedCategory())
            && (!q || [model.name, model.title, model.description, model.table, model.group,
                ...model.fields.flatMap(field => [field.name, field.title, field.description])]
                .some(text => lower(text).includes(q))));
    });
    readonly selectedModel = computed(() => this.visibleModels().find(item => item.name === this.selectedModelName())
        || this.visibleModels()[0] || null);
    readonly modelUsage = computed(() => {
        const name = this.selectedModel()?.name;
        return name ? this.operations().filter(op => op.requestModels.includes(name) || op.responseModels.includes(name)) : [];
    });
    readonly modelExample = computed(() => {
        const model = this.selectedModel();
        if (!model) return '';
        const example: Record<string, unknown> = {};
        for (const field of model.fields.slice(0, 30)) {
            if (field.example !== undefined && field.example !== '') example[field.name] = field.example;
            else if (field.type.startsWith('Список')) example[field.name] = [];
            else if (/boolean/i.test(field.type)) example[field.name] = false;
            else if (/^(int|long|short|double|float|number|integer|BigDecimal)/i.test(field.type)) example[field.name] = 0;
            else if (field.reference) example[field.name] = {};
            else example[field.name] = '<значение>';
        }
        return JSON.stringify(example, null, 2);
    });
    readonly groups = computed(() => [...new Set((this.database()?.tables || []).map(table => table.group || 'Другие таблицы'))]
        .sort((a, b) => a.localeCompare(b, 'ru')));
    readonly visibleTables = computed(() => {
        const q = lower(this.search().trim());
        return (this.database()?.tables || []).filter(table => (!this.selectedGroup() || table.group === this.selectedGroup())
            && (!q || [table.name, table.title, table.description, table.group,
                ...table.columns.flatMap(col => [col.name, col.title, col.description])]
                .some(text => lower(text).includes(q))));
    });
    readonly tableGroups = computed(() => {
        const names = [...new Set(this.visibleTables().map(table => table.group || 'Другие таблицы'))]
            .sort((a, b) => a.localeCompare(b, 'ru'));
        return names.map(name => ({ name, tables: this.visibleTables().filter(table => (table.group || 'Другие таблицы') === name) }));
    });
    readonly selectedTable = computed(() => this.visibleTables().find(item => item.name === this.selectedTableName())
        || this.visibleTables()[0] || null);
    readonly relatedTables = computed(() => {
        const current = this.selectedTable();
        if (!current) return [];
        const result = new Map<string, string>();
        for (const relation of current.relations) result.set(relation.toTable, `→ ${relation.toTable}`);
        for (const table of this.database()?.tables || []) for (const relation of table.relations) {
            if (relation.toTable === current.name) result.set(table.name, `← ${table.name}`);
        }
        return [...result].filter(([name]) => name !== current.name).map(([name, direction]) => ({
            name, title: this.database()?.tables.find(table => table.name === name)?.title || name,
            direction,
        }));
    });
    readonly tableModels = computed(() => this.models().filter(model => model.table === this.selectedTable()?.name));

    constructor() { this.refresh(); }
    select(tab: DocsTab): void { this.activeTab.set(tab); this.search.set(''); }
    onSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
    onTag(event: Event): void { this.selectedTag.set((event.target as HTMLSelectElement).value); }
    onRole(event: Event): void { this.selectedRole.set((event.target as HTMLSelectElement).value); }
    onMethod(event: Event): void { this.selectedMethod.set((event.target as HTMLSelectElement).value); }
    onAction(event: Event): void { this.selectedAction.set((event.target as HTMLSelectElement).value); }
    onCategory(event: Event): void { this.selectedCategory.set((event.target as HTMLSelectElement).value as ModelCategory | ''); }
    onGroup(event: Event): void { this.selectedGroup.set((event.target as HTMLSelectElement).value); }
    isSelectedModel(name: string): boolean { return this.selectedModel()?.name === name; }
    isSelectedTable(name: string): boolean { return this.selectedTable()?.name === name; }
    selectModel(name: string): void { this.selectedModelName.set(name); this.activeTab.set('dto'); this.search.set(''); this.selectedCategory.set(''); }
    selectTable(name: string): void { this.selectedTableName.set(name); this.activeTab.set('database'); this.search.set(''); this.selectedGroup.set(''); }

    private categoryFor(name: string, enumeration: boolean, requests: Set<string>, responses: Set<string>): ModelCategory {
        if (enumeration) return 'Перечисления';
        if (requests.has(name) && !responses.has(name)) return 'Запросы';
        if (responses.has(name) && !requests.has(name)) return 'Ответы';
        if (name.endsWith('Request')) return 'Запросы';
        if (name.endsWith('Response')) return 'Ответы';
        return 'Общие модели';
    }

    refresh(): void {
        this.http.get<ApiDoc>('/v3/api-docs').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: spec => { this.api.set(spec); this.apiError.set(''); },
            error: () => this.apiError.set('OpenAPI недоступен. Проверьте /v3/api-docs и конфигурацию Springdoc.'),
        });
        this.http.get<EndpointAccess[]>('/api/argent-docs/roles').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: access => this.accessList.set(access),
            error: () => this.accessList.set([]),
        });
        this.http.get<DbResponse>('/api/argent-docs/database').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: data => { this.database.set(data); this.schemaError.set(''); },
            error: () => this.schemaError.set('Схема БД недоступна. Требуются права admin и argent.docs.enabled=true.'),
        });
        this.http.get<DtoResponse[]>('/api/argent-docs/dtos').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: data => { this.annotatedDtos.set(data); this.dtoError.set(''); },
            error: () => this.dtoError.set('Дополнительные DTO недоступны. Требуются права admin.'),
        });
    }
}
