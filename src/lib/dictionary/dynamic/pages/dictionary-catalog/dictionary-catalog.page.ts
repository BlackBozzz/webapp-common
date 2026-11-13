import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AuthStore } from '../../../../auth/service/auth.store';
import { DynamicDictionarySummary } from '../../dto/dynamic-dictionary.dto';
import { DynamicDictionaryApiService } from '../../service/dynamic-dictionary-api.service';
import { DynamicDictionaryErrorService } from '../../service/dynamic-dictionary-error.service';

interface CatalogGroup {
    label: string;
    kind: 'dictionary' | 'table';
    items: DynamicDictionarySummary[];
}

/** Общий каталог: справочники и таблицы приложений с поиском и группировкой. */
@Component({
    selector: 'argent-dictionary-catalog-page',
    standalone: true,
    imports: [RouterLink, ButtonDirective, CardModule],
    templateUrl: './dictionary-catalog.page.html',
    styleUrl: './dictionary-catalog.page.scss',
    changeDetection: ChangeDetectionStrategy.Default,
})
export class DictionaryCatalogPage {
    private readonly api = inject(DynamicDictionaryApiService);
    private readonly errors = inject(DynamicDictionaryErrorService);
    private readonly auth = inject(AuthStore);
    private readonly destroyRef = inject(DestroyRef);

    readonly dictionaries = signal<DynamicDictionarySummary[]>([]);
    readonly loading = signal(true);
    readonly error = signal('');
    readonly searchText = signal('');

    readonly visibleDictionaries = computed(() => {
        this.auth.user();
        const search = this.searchText().trim().toLocaleLowerCase('ru');
        return this.dictionaries().filter(item => this.auth.canTable(item.code, 'read') &&
            (!search || [item.name, item.code, item.group ?? '', item.kind ?? 'dictionary']
                .some(value => value.toLocaleLowerCase('ru').includes(search))));
    });

    readonly grouped = computed<CatalogGroup[]>(() => {
        const groups = new Map<string, CatalogGroup>();
        for (const item of this.visibleDictionaries()) {
            const kind = item.kind === 'table' ? 'table' : 'dictionary';
            const label = item.group?.trim() || (kind === 'table' ? 'Таблицы' : 'Справочники');
            const id = `${kind}:${label}`;
            if (!groups.has(id)) groups.set(id, { kind, label, items: [] });
            groups.get(id)!.items.push(item);
        }
        return [...groups.values()].sort((a, b) =>
            (a.kind === b.kind ? a.label.localeCompare(b.label, 'ru') : a.kind === 'dictionary' ? -1 : 1));
    });

    constructor() { this.refresh(); }

    search(event: Event): void {
        this.searchText.set((event.target as HTMLInputElement).value);
    }

    refresh(): void {
        this.loading.set(true);
        this.error.set('');
        this.api.getDictionaries().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: rows => { this.dictionaries.set(rows); this.loading.set(false); },
            error: error => { this.loading.set(false); this.error.set(this.errors.message(error)); },
        });
    }
}
