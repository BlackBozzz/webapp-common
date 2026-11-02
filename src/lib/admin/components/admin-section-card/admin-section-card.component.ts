import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { AdminNavigationItem } from '../../dto/admin-navigation-item.dto';

/** Краткая карточка раздела на главной странице админки. */
@Component({
    selector: 'argent-admin-section-card',
    standalone: true,
    imports: [CardModule, RouterLink],
    templateUrl: './admin-section-card.component.html',
    styleUrl: './admin-section-card.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSectionCardComponent {
    @Input({ required: true }) item!: AdminNavigationItem;
}
