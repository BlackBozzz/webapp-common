import { Directive, TemplateRef, inject } from '@angular/core';

/** Пользовательский шаблон: let-row содержит исходную запись. */
@Directive({ selector: 'ng-template[argentTableCell]', standalone: true })
export class ArgentTableCellDirective {
    readonly template = inject(TemplateRef<{$implicit: unknown}>);
}
