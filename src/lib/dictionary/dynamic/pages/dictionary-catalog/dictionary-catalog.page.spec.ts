import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AuthStore } from '../../../../auth/service/auth.store';
import { DynamicDictionaryApiService } from '../../service/dynamic-dictionary-api.service';
import { DictionaryCatalogPage } from './dictionary-catalog.page';

describe('DictionaryCatalogPage', () => {
    it('hides dictionaries without read grant', () => {
        TestBed.configureTestingModule({
            imports: [DictionaryCatalogPage],
            providers: [
                provideRouter([]),
                provideHttpClient(),
                provideHttpClientTesting(),
                {
                    provide: DynamicDictionaryApiService,
                    useValue: {
                        getDictionaries: () => of([
                            { code: 'dict_a', name: 'Справочник A' },
                            { code: 'dict_b', name: 'Справочник B' },
                        ]),
                    },
                },
            ],
        });
        TestBed.inject(AuthStore).user.set({
            id: '1',
            login: 'ivan',
            displayName: 'Иван',
            grants: { tables: { dict_a: ['read'] }, actions: [] },
        });

        const fixture = TestBed.createComponent(DictionaryCatalogPage);
        fixture.detectChanges();

        const codes = Array.from(
            (fixture.nativeElement as HTMLElement).querySelectorAll('.argent-catalog__code'),
        ).map(element => element.textContent?.trim());
        expect(codes).toEqual(['dict_a']);
    });
    it('groups custom tables, and searches by group and title', () => {
        TestBed.configureTestingModule({
            imports: [DictionaryCatalogPage],
            providers: [
                provideRouter([]),
                provideHttpClient(),
                provideHttpClientTesting(),
                {
                    provide: DynamicDictionaryApiService,
                    useValue: {
                        getDictionaries: () => of([
                            { code: 'dict_department', name: 'Отделы', kind: 'dictionary', group: 'План производства' },
                            { code: 'app_document', name: 'Документы', kind: 'table', group: 'Управление документацией' },
                        ]),
                    },
                },
            ],
        });
        TestBed.inject(AuthStore).user.set({
            id: '1', login: 'test', displayName: 'Test',
            grants: { tables: { '*': ['read'] }, actions: [] },
        });
        const fixture = TestBed.createComponent(DictionaryCatalogPage);
        fixture.detectChanges();
        const page = fixture.componentInstance;

        expect(page.grouped().map(group => [group.kind, group.label])).toEqual([
            ['dictionary', 'План производства'], ['table', 'Управление документацией'],
        ]);
        page.searchText.set('документац');
        fixture.detectChanges();
        expect(page.grouped().map(group => group.items.map(x => x.code))).toEqual([['app_document']]);
    });

});
