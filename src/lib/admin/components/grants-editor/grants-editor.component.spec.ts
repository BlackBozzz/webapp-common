import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Grants } from '../../../auth/dto/auth.dto';
import { GrantsEditorComponent, normalizeGrants } from './grants-editor.component';

describe('GrantsEditorComponent', () => {
    let fixture: ComponentFixture<GrantsEditorComponent>;
    let editor: GrantsEditorComponent;
    let onChange: ReturnType<typeof vi.fn<(value: Grants) => void>>;

    beforeEach(() => {
        TestBed.configureTestingModule({ imports: [GrantsEditorComponent] });
        fixture = TestBed.createComponent(GrantsEditorComponent);
        editor = fixture.componentInstance;
        onChange = vi.fn<(value: Grants) => void>();
        editor.registerOnChange(onChange);
        editor.writeValue({ tables: {}, actions: [] });
        fixture.detectChanges();
    });

    it('emits grants with star and actions', () => {
        editor['addRow']();
        editor['setTable'](0, '*');
        editor['setOp'](0, 'read', true);
        editor['addRow']();
        editor['setTable'](1, 'documents');
        editor['setOp'](1, 'read', true);
        editor['setOp'](1, 'write', true);
        editor['addAction']('documents.approve');

        expect(onChange).toHaveBeenLastCalledWith({
            tables: { '*': ['read'], documents: ['read', 'write'] },
            actions: ['documents.approve'],
        });
    });

    it('rejects invalid JSON text', () => {
        editor.writeValue({ tables: { documents: ['read'] }, actions: [] });
        editor['toggleJson']();
        fixture.detectChanges();

        editor['setJsonText']('{bad');
        editor['applyJson']();
        fixture.detectChanges();

        expect(onChange).not.toHaveBeenCalled();
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('Некорректный JSON');
        expect(editor['value']()).toEqual({ tables: { documents: ['read'] }, actions: [] });
    });

    it('normalises ops and sorting', () => {
        editor['toggleJson']();
        editor['setJsonText']('{"tables":{"zeta":["write"],"docs":["WRITE","read","read"]},"actions":["b","a","b"]}');
        editor['applyJson']();

        expect(onChange).toHaveBeenLastCalledWith({
            tables: { docs: ['read', 'write'], zeta: ['write'] },
            actions: ['a', 'b'],
        });
        expect(Object.keys(onChange.mock.lastCall![0].tables)).toEqual(['docs', 'zeta']);
        expect(normalizeGrants({ tables: { t: ['WRITE', 'read'] }, actions: [] }).tables['t']).toEqual(['read', 'write']);
    });

    it('invalid JSON marks the control invalid', () => {
        const host = TestBed.createComponent(GrantsEditorHostComponent);
        host.detectChanges();
        const control = host.componentInstance.control;
        const hosted = host.debugElement.query(By.directive(GrantsEditorComponent))
            .componentInstance as GrantsEditorComponent;

        hosted['toggleJson']();
        hosted['setJsonText']('{bad');
        hosted['applyJson']();
        expect(control.invalid).toBe(true);
        expect(control.errors).toEqual({ grantsJson: 'Некорректный JSON' });

        hosted['setJsonText']('{"tables":{"docs":["read"]}}');
        hosted['applyJson']();
        expect(control.valid).toBe(true);
        expect(control.value).toEqual({ tables: { docs: ['read'] }, actions: [] });
    });
});

/** Хост с реактивным контролом для проверки валидатора редактора. */
@Component({
    standalone: true,
    imports: [ReactiveFormsModule, GrantsEditorComponent],
    template: '<argent-grants-editor [formControl]="control" />',
})
class GrantsEditorHostComponent {
    readonly control = new FormControl<Grants>({ tables: {}, actions: [] }, { nonNullable: true });
}
