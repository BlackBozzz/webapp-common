import { Injectable, signal } from '@angular/core';

/** Состояние навигационной оболочки в рамках одного AdminLayout. */
@Injectable()
export class AdminLayoutStateService {
    private readonly _collapsed = signal(false);
    private readonly _mobileOpen = signal(false);

    get collapsed(): boolean {
        return this._collapsed();
    }

    get mobileOpen(): boolean {
        return this._mobileOpen();
    }

    toggleCollapsed(): void {
        this._collapsed.update(value => !value);
    }

    toggleMobile(): void {
        this._mobileOpen.update(value => !value);
    }

    closeMobile(): void {
        this._mobileOpen.set(false);
    }
}
