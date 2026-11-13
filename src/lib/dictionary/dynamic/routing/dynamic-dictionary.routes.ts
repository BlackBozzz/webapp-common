import { Routes } from '@angular/router';

/** Встраиваемые дочерние маршруты. Префикс admin уже принадлежит ARGENT_ROUTES. */
export const ARGENT_DYNAMIC_DICTIONARY_ROUTES: Routes = [
    {
        path: '',
        loadComponent: () => import('../pages/dictionary-feature-shell/dictionary-feature-shell.component')
            .then(m => m.DictionaryFeatureShellComponent),
        children: [
            {
                path: '',
                pathMatch: 'full',
                title: 'Данные',
                loadComponent: () => import('../pages/dictionary-catalog/dictionary-catalog.page')
                    .then(m => m.DictionaryCatalogPage),
            },
            {
                path: ':code',
                title: 'Записи справочника',
                loadComponent: () => import('../pages/dictionary-records/dictionary-records.page')
                    .then(m => m.DictionaryRecordsPage),
            },
        ],
    },
];
