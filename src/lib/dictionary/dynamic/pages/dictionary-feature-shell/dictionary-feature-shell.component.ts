import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Область дочерних маршрутов универсальных справочников. */
@Component({
    selector: 'argent-dictionary-feature-shell',
    standalone: true,
    imports: [RouterOutlet],
    templateUrl: './dictionary-feature-shell.component.html',
    styleUrl: './dictionary-feature-shell.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DictionaryFeatureShellComponent {}
