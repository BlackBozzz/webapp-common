import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

/** Заготовка будущей формы создания и редактирования DTO. */
@Component({
    selector: 'argent-dictionary-form-page',
    standalone: true,
    imports: [AsyncPipe],
    templateUrl: './dictionary-form.page.html',
    styleUrl: './dictionary-form.page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryFormPage {
    private readonly route = inject(ActivatedRoute);

    readonly code$ = this.route.paramMap.pipe(map(params => params.get('code') ?? ''));
    readonly mode$ = this.route.data.pipe(
        map(data => data['mode'] === 'create' ? 'Создание' : 'Редактирование'),
    );
}
