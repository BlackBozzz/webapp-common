import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** Единое сообщение об отсутствии записей. */
@Component({
    selector: 'argent-table-empty-state', standalone: true,
    templateUrl: './argent-table-empty-state.component.html',
    styleUrl: './argent-table-empty-state.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArgentTableEmptyStateComponent {
    @Input() message = 'Нет данных';
}
