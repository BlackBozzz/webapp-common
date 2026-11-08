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
});
