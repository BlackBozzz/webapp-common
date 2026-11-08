import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonDirective } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { MultiSelect } from 'primeng/multiselect';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Toast } from 'primeng/toast';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';
import { Observable, Subject, Subscription, debounceTime, finalize } from 'rxjs';
import { DynamicPage } from '../../../dictionary/dynamic/dto/dynamic-dictionary.dto';
import { FieldErrorComponent } from '../../../errors/field-error/field-error.component';
import { applyServerErrors, problemMessage, toProblemDetail } from '../../../errors/problem-detail';
import { RoleDto } from '../../dto/admin-roles.dto';
import { CreateUserRequest, UserDto } from '../../dto/admin-users.dto';
import { AdminRolesApiService } from '../../service/admin-roles-api.service';
import { AdminUsersApiService } from '../../service/admin-users-api.service';

/** Ограничения длины пароля — как у `@Size(min = 6, max = 72)` на backend. */
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 72;

/** Вариант выбора роли в multiselect строки. */
interface RoleOption {
    label: string;
    value: string;
}

/**
 * Пользователи: таблица с поиском, создание, роли, блокировка, пароль и отзыв сессий.
 * 403 показывает интерцептор ошибок, остальные ошибки — toast страницы или поля диалогов.
 */
@Component({
    selector: 'argent-admin-users-page',
    standalone: true,
    imports: [
        DatePipe, FormsModule, ReactiveFormsModule, TableModule, ButtonDirective, InputText, MultiSelect,
        ToggleSwitch, Tag, Tooltip, Dialog, ConfirmDialog, Toast, FieldErrorComponent,
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './admin-users.page.html',
    styleUrl: './admin-users.page.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersPage implements OnInit {
    private readonly usersApi = inject(AdminUsersApiService);
    private readonly rolesApi = inject(AdminRolesApiService);
    private readonly confirm = inject(ConfirmationService);
    private readonly messages = inject(MessageService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly searchChanged = new Subject<void>();
    private dataRequest?: Subscription;

    protected readonly page = signal<DynamicPage<UserDto> | null>(null);
    protected readonly loading = signal(false);
    protected readonly error = signal('');
    protected readonly searchText = signal('');
    protected readonly pageIndex = signal(0);
    protected readonly pageSize = signal(20);
    protected readonly roles = signal<RoleDto[]>([]);
    protected readonly roleOptions = computed<RoleOption[]>(() =>
        this.roles().map(role => ({ label: `${role.name} (${role.code})`, value: role.code })));
    /** Несохранённые изменения ролей по id пользователя; сохраняются при закрытии панели. */
    private readonly roleDrafts = new Map<string, string[]>();
    /** Пользователи, по которым сейчас выполняется запрос (блокирует элементы строки). */
    protected readonly busyIds = signal<ReadonlySet<string>>(new Set());

    protected readonly createVisible = signal(false);
    protected readonly creating = signal(false);
    protected readonly createForm = new FormGroup({
        login: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
        displayName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
        // Необязателен; если введён — 6–72 символа (minLength/maxLength пропускают пустое значение).
        password: new FormControl('', {
            nonNullable: true,
            validators: [Validators.minLength(PASSWORD_MIN), Validators.maxLength(PASSWORD_MAX)],
        }),
    });

    protected readonly passwordUser = signal<UserDto | null>(null);
    protected readonly savingPassword = signal(false);
    protected readonly passwordForm = new FormGroup({
        password: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required, Validators.minLength(PASSWORD_MIN), Validators.maxLength(PASSWORD_MAX)],
        }),
    });

    constructor() {
        this.searchChanged.pipe(
            debounceTime(350),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(() => {
            this.pageIndex.set(0);
            this.loadUsers();
        });
        this.destroyRef.onDestroy(() => this.dataRequest?.unsubscribe());
    }

    ngOnInit(): void {
        this.rolesApi.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: roles => this.roles.set(roles),
            error: error => this.notifyError(error, 'Не удалось загрузить роли'),
        });
    }

    protected search(event: Event): void {
        this.searchText.set((event.target as HTMLInputElement).value);
        this.searchChanged.next();
    }

    /** Lazy-загрузка таблицы: первая загрузка, смена страницы или размера страницы. */
    protected paginate(event: TableLazyLoadEvent): void {
        const size = event.rows || this.pageSize();
        this.pageSize.set(size);
        this.pageIndex.set(Math.floor((event.first || 0) / size));
        this.loadUsers();
    }

    protected refresh(): void {
        this.loadUsers();
    }

    protected isBusy(user: UserDto): boolean {
        return this.busyIds().has(user.id);
    }

    // ---- Роли ----

    protected changeRoles(user: UserDto, roleCodes: string[] | null): void {
        this.roleDrafts.set(user.id, roleCodes ?? []);
    }

    /** Закрытие панели multiselect: сохраняем роли, если набор изменился. */
    protected saveRoles(user: UserDto): void {
        const draft = this.roleDrafts.get(user.id);
        this.roleDrafts.delete(user.id);
        if (!draft || sameCodes(draft, user.roles)) return;
        this.runForUser(user, this.usersApi.setRoles(user.id, draft), 'Роли не сохранены', saved => {
            this.messages.add({ severity: 'success', summary: 'Роли сохранены', detail: saved.login });
        });
    }

    // ---- Активность ----

    protected toggleEnabled(user: UserDto, enabled: boolean): void {
        const request = this.usersApi.update(user.id, { displayName: user.displayName, enabled });
        this.runForUser(user, request, 'Не удалось изменить активность', saved => {
            this.messages.add({
                severity: 'success',
                summary: saved.enabled ? 'Пользователь активирован' : 'Пользователь заблокирован',
                detail: saved.login,
            });
        });
    }

    // ---- Создание ----

    protected openCreate(): void {
        this.createForm.reset();
        this.createVisible.set(true);
    }

    protected closeCreate(): void {
        if (!this.creating()) this.createVisible.set(false);
    }

    protected create(): void {
        if (this.createForm.invalid) {
            this.createForm.markAllAsTouched();
            return;
        }
        const { login, displayName, password } = this.createForm.getRawValue();
        const request: CreateUserRequest = { login: login.trim(), displayName: displayName.trim() };
        // Пустой пароль не отправляем: backend считает «без пароля» только отсутствующее поле (null).
        if (password) request.password = password;
        this.creating.set(true);
        this.usersApi.create(request).pipe(
            finalize(() => this.creating.set(false)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: user => {
                this.createVisible.set(false);
                this.messages.add({ severity: 'success', summary: 'Пользователь создан', detail: user.login });
                this.loadUsers();
            },
            error: error => {
                if (!applyServerErrors(this.createForm, error)) {
                    this.notifyError(error, 'Пользователь не создан');
                }
            },
        });
    }

    // ---- Пароль ----

    protected openPassword(user: UserDto): void {
        this.passwordForm.reset();
        this.passwordUser.set(user);
    }

    protected closePassword(): void {
        if (!this.savingPassword()) this.passwordUser.set(null);
    }

    protected savePassword(): void {
        const user = this.passwordUser();
        if (!user) return;
        if (this.passwordForm.invalid) {
            this.passwordForm.markAllAsTouched();
            return;
        }
        this.savingPassword.set(true);
        this.usersApi.setPassword(user.id, this.passwordForm.getRawValue().password).pipe(
            finalize(() => this.savingPassword.set(false)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: () => {
                this.passwordUser.set(null);
                this.replaceUser({ ...user, hasPassword: true });
                this.messages.add({ severity: 'success', summary: 'Пароль задан', detail: user.login });
            },
            error: error => {
                if (!applyServerErrors(this.passwordForm, error)) {
                    this.notifyError(error, 'Пароль не задан');
                }
            },
        });
    }

    // ---- Сессии ----

    protected confirmRevoke(user: UserDto): void {
        this.confirm.confirm({
            header: 'Отзыв сессий',
            message: `Завершить все сессии пользователя «${user.login}»? Ему придётся войти заново.`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Отозвать',
            rejectLabel: 'Отмена',
            acceptButtonProps: { severity: 'danger' },
            rejectButtonProps: { severity: 'secondary' },
            accept: () => this.revoke(user),
        });
    }

    private revoke(user: UserDto): void {
        this.markBusy(user.id, true);
        this.usersApi.revokeSessions(user.id).pipe(
            finalize(() => this.markBusy(user.id, false)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: () => this.messages.add({ severity: 'success', summary: 'Сессии отозваны', detail: user.login }),
            error: error => this.notifyError(error, 'Сессии не отозваны'),
        });
    }

    // ---- Служебное ----

    private loadUsers(): void {
        this.dataRequest?.unsubscribe();
        this.loading.set(true);
        this.error.set('');
        this.dataRequest = this.usersApi.list({
            search: this.searchText(),
            page: this.pageIndex(),
            size: this.pageSize(),
        }).subscribe({
            next: page => {
                this.page.set(page);
                this.loading.set(false);
            },
            error: error => {
                this.loading.set(false);
                this.error.set(problemMessage(error, 'Не удалось загрузить пользователей'));
            },
        });
    }

    /**
     * Запрос, меняющий пользователя: на время запроса строка заблокирована; при успехе строка
     * заменяется ответом сервера, при ошибке — копией исходной (новый объект перерисовывает
     * строку и сбрасывает переключатель и выбор ролей к сохранённому состоянию).
     */
    private runForUser(
        user: UserDto,
        request: Observable<UserDto>,
        failure: string,
        done: (saved: UserDto) => void,
    ): void {
        this.markBusy(user.id, true);
        request.pipe(
            finalize(() => this.markBusy(user.id, false)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: saved => {
                this.replaceUser(saved);
                done(saved);
            },
            error: error => {
                this.replaceUser({ ...user });
                this.notifyError(error, failure);
            },
        });
    }

    private replaceUser(user: UserDto): void {
        this.page.update(page => page && {
            ...page,
            items: page.items.map(item => item.id === user.id ? user : item),
        });
    }

    private markBusy(id: string, busy: boolean): void {
        this.busyIds.update(ids => {
            const next = new Set(ids);
            if (busy) next.add(id); else next.delete(id);
            return next;
        });
    }

    /**
     * Toast об ошибке на странице (в том числе 409 с `detail`). 401 и 403 уже обработал
     * интерцептор ошибок (переход на вход или toast «Недостаточно прав»), их не дублируем.
     * Для 400 с ошибками полей, не попавшими в форму (например, `roleCodes`), показываем первую из них.
     */
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

/** Совпадают ли наборы кодов ролей без учёта порядка. */
function sameCodes(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) return false;
    const codes = new Set(right);
    return left.every(code => codes.has(code));
}
