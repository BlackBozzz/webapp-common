import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AdminNavigationItem } from '../../dto/admin-navigation-item.dto';

/** Один пункт меню, включая неактивные будущие разделы. */
@Component({
    selector: 'argent-admin-nav-item',
    standalone: true,
    imports: [RouterLink, RouterLinkActive],
    templateUrl: './admin-nav-item.component.html',
    styleUrl: './admin-nav-item.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNavItemComponent {
    @Input({ required: true }) item!: AdminNavigationItem;

    @Input() set collapsed(value: boolean) {
        this._collapsed = value;
    }

    @Output() navigated = new EventEmitter<void>();

    private _collapsed = false;

    get collapsed(): boolean {
        return this._collapsed;
    }
}
