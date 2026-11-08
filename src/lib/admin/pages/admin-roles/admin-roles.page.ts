import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonDirective } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { Toast } from 'primeng/toast';
import { finalize } from 'rxjs';
import type { Grants } from '../../../auth/dto/auth.dto';
import { FieldErrorComponent } from '../../../errors/field-error/field-error.component';
import { applyServerErrors, problemMessage, toProblemDetail } from '../../../errors/problem-detail';
import { GrantsEditorComponent } from '../../components/grants-editor/grants-editor.component';
import { GrantsCatalog, RoleDto, RoleRequest } from '../../dto/admin-roles.dto';
import { AdminRolesApiService } from '../../service/admin-roles-api.service';

/** Код роли — как на backend: латиница в верхнем регистре, цифры и `_`, до 50 символов. */
const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,49}$/;

/**
 * Проверка кода роли по {@link ROLE_CODE_PATTERN} после `trim` и перевода в верхний регистр:
 * поле показывает текст заглавными через CSS, а приводится значение при сохранении.
 */
function roleCodeValidator(control: AbstractControl<string>): ValidationErrors | null {
    const code = (control.value ?? '').trim().toUpperCase();
    return !code || ROLE_CODE_PATTERN.test(code) ? null : { pattern: { requiredPattern: String(ROLE_CODE_PATTERN) } };
}

/** Пустые гранты для новой роли. */
const EMPTY_GRANTS: Grants = { tables: {}, actions: [] };

/**
 * Администрирование ролей: список ролей с грантами, создание и изменение в диалоге
 * с редактором грантов, удаление. У системной роли меняются только имя и описание
 * (гранты сервер всё равно сбрасывает к набору администратора), удалить её нельзя.
 * Ошибки грантов (`grants`, `grants.tables`, `grants.actions`) показываются под редактором,
 * 403 — интерцептором ошибок, 409 и прочее — toast страницы.
 */
@Component({
    selector: 'argent-admin-roles-page',
    standalone: true,
    imports: [
        ReactiveFormsModule, TableModule, ButtonDirective, InputText, Textarea, Tag, Dialog, ConfirmDialog, Toast,
        FieldErrorComponent, GrantsEditorComponent,
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './admin-roles.page.html',
    styleUrl: './admin-roles.page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRolesPage implements OnInit {
    private readonly rolesApi = inject(AdminRolesApiService);
    private readonly confirm = inject(ConfirmationService);
    private readonly messages = inject(MessageService);
    private readonly destroyRef = inject(DestroyRef);

    protected readonly roles = signal<RoleDto[]>([]);
    protected readonly loading = signal(false);
    protected readonly error = signal('');
    protected readonly catalog = signal<GrantsCatalog | null>(null);
    /** Коды ролей, по которым идёт удаление. */
    protected readonly deletingCodes = signal<ReadonlySet<string>>(new Set());

    /** Открытый диалог: `create` — новая роль, иначе редактируемая роль. */
    protected readonly dialog = signal<'create' | RoleDto | null>(null);
    protected readonly editedRole = computed(() => {
        const dialog = this.dialog();
        return dialog && dialog !== 'create' ? dialog : null;
    });
    protected readonly isCreate = computed(() => this.dialog() === 'create');
    protected readonly isSystem = computed(() => this.editedRole()?.system ?? false);
    protected readonly saving = signal(false);
    /** Ошибка грантов от сервера (400 с `field` = `grants*`) — показывается под редактором. */
    protected readonly grantsError = signal('');

    protected readonly form = new FormGroup({
        code: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required, roleCodeValidator],
        }),
        name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] }),
        description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
        grants: new FormControl<Grants>(EMPTY_GRANTS, { nonNullable: true }),
    });

    constructor() {
        // Правка грантов снимает серверную ошибку под редактором.
        this.form.controls.grants.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.grantsError.set(''));
    }

    ngOnInit(): void {
        this.loadRoles();
        // Без каталога редактор работает со свободным вводом, поэтому ошибку не показываем.
        this.rolesApi.catalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: catalog => this.catalog.set(catalog),
            error: () => this.catalog.set(null),
        });
    }

    protected refresh(): void {
        this.loadRoles();
    }

    protected tableCount(role: RoleDto): number {
        return Object.keys(role.grants?.tables ?? {}).length;
    }

    protected actionCount(role: RoleDto): number {
        return role.grants?.actions?.length ?? 0;
    }

    protected isDeleting(role: RoleDto): boolean {
        return this.deletingCodes().has(role.code);
    }

    // ---- Диалог ----

    protected openCreate(): void {
        this.form.reset({ code: '', name: '', description: '', grants: EMPTY_GRANTS });
        this.form.controls.code.enable();
        this.form.controls.grants.enable();
        this.grantsError.set('');
        this.dialog.set('create');
    }

    protected openEdit(role: RoleDto): void {
        this.form.reset({
            code: role.code,
            name: role.name,
            description: role.description ?? '',
            grants: role.grants ?? EMPTY_GRANTS,
        });
        this.form.controls.code.disable();
        if (role.system) this.form.controls.grants.disable(); else this.form.controls.grants.enable();
        this.grantsError.set('');
        this.dialog.set(role);
    }

    protected closeDialog(): void {
        if (!this.saving()) this.dialog.set(null);
    }

    protected save(): void {
        const dialog = this.dialog();
        if (!dialog) return;
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }
        const { code, name, description, grants } = this.form.getRawValue();
        const roleCode = dialog === 'create' ? code.trim().toUpperCase() : dialog.code;
        // PUT — это upsert: при создании не даём молча перезаписать существующую роль.
        if (dialog === 'create' && this.roles().some(role => role.code === roleCode)) {
            this.form.controls.code.setErrors({ server: 'Роль с таким кодом уже есть' });
            this.form.controls.code.markAsTouched();
            return;
        }
        const request: RoleRequest = {
            name: name.trim(),
            description: description.trim() || null,
            // Гранты системной роли сервер игнорирует — отправляем сохранённые.
            grants: dialog !== 'create' && dialog.system ? dialog.grants : grants,
        };
        this.grantsError.set('');
        this.saving.set(true);
        this.rolesApi.upsert(roleCode, request).pipe(
            finalize(() => this.saving.set(false)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: saved => {
                this.dialog.set(null);
                this.messages.add({
                    severity: 'success',
                    summary: dialog === 'create' ? 'Роль создана' : 'Роль сохранена',
                    detail: saved.code,
                });
                this.loadRoles();
            },
            error: error => this.handleSaveError(error),
        });
    }

    // ---- Удаление ----

    protected confirmDelete(role: RoleDto): void {
        if (role.system) return;
        this.confirm.confirm({
            header: 'Удаление роли',
            message: `Удалить роль «${role.name}» (${role.code})?`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Удалить',
            rejectLabel: 'Отмена',
            acceptButtonProps: { severity: 'danger' },
            rejectButtonProps: { severity: 'secondary' },
            accept: () => this.remove(role),
        });
    }

    private remove(role: RoleDto): void {
        this.markDeleting(role.code, true);
        this.rolesApi.remove(role.code).pipe(
            finalize(() => this.markDeleting(role.code, false)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: () => {
                this.roles.update(roles => roles.filter(item => item.code !== role.code));
                this.messages.add({ severity: 'success', summary: 'Роль удалена', detail: role.code });
            },
            error: error => this.notifyError(error, 'Роль не удалена'),
        });
    }

    // ---- Служебное ----

    private loadRoles(): void {
        this.loading.set(true);
        this.error.set('');
        this.rolesApi.list().pipe(
            finalize(() => this.loading.set(false)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: roles => this.roles.set(roles),
            error: error => this.error.set(problemMessage(error, 'Не удалось загрузить роли')),
        });
    }

    /**
     * 400: ошибки `grants*` собираются в одно сообщение под редактором, остальные поля — в форму;
     * если ничего не легло на форму — toast. 401/403 уже показал интерцептор.
     */
    private handleSaveError(error: unknown): void {
        if (error instanceof HttpErrorResponse && error.status === 400) {
            const fieldErrors = toProblemDetail(error)?.errors ?? [];
            const grantsMessages = fieldErrors.filter(item => isGrantsField(item.field)).map(item => item.message);
            if (grantsMessages.length) this.grantsError.set([...new Set(grantsMessages)].join('; '));
            // Ошибки грантов в форму не кладём: иначе контрол `grants` остался бы невалидным до правки.
            const otherErrors = new HttpErrorResponse({
                status: error.status,
                error: { ...toProblemDetail(error), errors: fieldErrors.filter(item => !isGrantsField(item.field)) },
            });
            const appliedToForm = applyServerErrors(this.form, otherErrors);
            if (grantsMessages.length || appliedToForm) return;
        }
        this.notifyError(error, 'Роль не сохранена');
    }

    private markDeleting(code: string, deleting: boolean): void {
        this.deletingCodes.update(codes => {
            const next = new Set(codes);
            if (deleting) next.add(code); else next.delete(code);
            return next;
        });
    }

    /** Toast об ошибке (в том числе 409 с `detail`); 401 и 403 уже обработал интерцептор. */
    private notifyError(error: unknown, summary: string): void {
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) return;
        const fieldMessage = toProblemDetail(error)?.errors?.[0]?.message;
        this.messages.add({
            severity: 'error',
            summary,
            detail: fieldMessage || problemMessage(error, 'Попробуйте ещё раз'),
        });
    }
}

/** Поле ошибки относится к грантам: `grants`, `grants.tables`, `grants.actions` (с любым префиксом). */
function isGrantsField(field: string): boolean {
    return /(^|\.)grants(\.|$)/.test(field);
}
