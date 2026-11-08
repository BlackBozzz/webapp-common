import { AuthStore } from '../../auth/service/auth.store';
import { AdminNavigationItem } from '../dto/admin-navigation-item.dto';

/** Показывать ли пункт: он включён и, если требует действие, оно есть в грантах пользователя. */
export function isNavigationItemVisible(item: AdminNavigationItem, store: AuthStore): boolean {
    return item.enabled && (!item.action || store.hasAction(item.action));
}
