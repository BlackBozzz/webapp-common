import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonDirective } from 'primeng/button';

/** Верхняя панель администратора. */
@Component({
    selector: 'argent-admin-header',
    standalone: true,
    imports: [ButtonDirective],
    templateUrl: './admin-header.component.html',
    styleUrl: './admin-header.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHeaderComponent {
    @Input() collapsed = false;

    @Output() toggleCollapsed = new EventEmitter<void>();
    @Output() toggleMobile = new EventEmitter<void>();
}
