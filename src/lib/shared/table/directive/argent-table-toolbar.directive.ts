import { Directive, TemplateRef, inject } from '@angular/core';

/** Дополнительные действия слева от стандартных кнопок. */
@Directive({ selector: 'ng-template[argentTableToolbarStart]', standalone: true })
export class ArgentTableToolbarStartDirective {
    readonly template = inject(TemplateRef<unknown>);
}

/** Дополнительные действия справа от стандартных кнопок. */
@Directive({ selector: 'ng-template[argentTableToolbarEnd]', standalone: true })
export class ArgentTableToolbarEndDirective {
    readonly template = inject(TemplateRef<unknown>);
}
