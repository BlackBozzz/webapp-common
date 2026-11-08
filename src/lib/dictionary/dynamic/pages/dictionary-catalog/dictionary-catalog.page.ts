import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AuthStore } from '../../../../auth/service/auth.store';
import { DynamicDictionarySummary } from '../../dto/dynamic-dictionary.dto';
import { DynamicDictionaryApiService } from '../../service/dynamic-dictionary-api.service';
import { DynamicDictionaryErrorService } from '../../service/dynamic-dictionary-error.service';

/** Каталог зарегистрированных справочников из backend. */
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
    /** Справочники, на которые у пользователя есть грант `read` (фильтр только для UI, права проверяет backend). */
    readonly visibleDictionaries = computed(() => {
        // Явно читаем пользователя, чтобы список пересчитывался после загрузки грантов.
        this.auth.user();
        return this.dictionaries().filter(dictionary => this.auth.canTable(dictionary.code, 'read'));
    });

    constructor() {
        this.refresh();
    }

    refresh(): void {
        this.loading.set(true);
        this.error.set('');
        this.api.getDictionaries().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: dictionaries => {
                this.dictionaries.set(dictionaries);
                this.loading.set(false);
            },
            error: error => {
                this.loading.set(false);
                this.error.set(this.errors.message(error));
            },
        });
    }
}
