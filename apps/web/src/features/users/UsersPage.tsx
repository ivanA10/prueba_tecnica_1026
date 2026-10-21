import { forwardRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PERMISSIONS, WILDCARD, hasPermission } from '@toka/contracts';
import {
  useAssignRoleMutation,
  useCreateUserMutation,
  useDeleteUserMutation,
  useGetRoleOptionsQuery,
  useGetUsersQuery,
  useUpdateUserMutation,
} from '@/api/users';
import type { User } from '@/api/types';
import { ConfirmDialog, ErrorMessage, Spinner, errorText } from '@/components/shared';
import { useAppDispatch, useAppSelector, useCan } from '@/store/hooks';
import { notify } from '@/store/notifications';

export const userSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  roleId: z.string().min(1, 'El rol es obligatorio'),
});
type UserValues = z.infer<typeof userSchema>;

const editSchema = userSchema.pick({ name: true, email: true, roleId: true });
type EditValues = z.infer<typeof editSchema>;

type RoleOpt = { id: string; name: string };

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

const STATUS: Record<User['status'], { label: string; cls: string }> = {
  ACTIVE: { label: 'Activo', cls: 'tag-accent' },
  PENDING: { label: 'Pendiente', cls: 'tag-neutral' },
  DISABLED: { label: 'Deshabilitado', cls: 'tag-outline' },
};

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
const PencilIcon = () => (
  <svg {...iconProps}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const TrashIcon = () => (
  <svg {...iconProps}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
  </svg>
);

const RoleSelect = forwardRef<HTMLSelectElement, { roles: RoleOpt[]; id: string } & React.SelectHTMLAttributes<HTMLSelectElement>>(function RoleSelect({ roles, id, ...rest }, ref) {
  return (
    <select className="input" id={id} ref={ref} {...rest}>
      <option value="">Selecciona un rol</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
});

function CreateDialog({ roles, onDone }: { roles: RoleOpt[]; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const [create, { isLoading }] = useCreateUserMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UserValues>({ resolver: zodResolver(userSchema), defaultValues: { roleId: '' } });
  async function onSubmit(v: UserValues) {
    try {
      await create(v).unwrap();
      dispatch(notify('success', 'Usuario creado'));
      onDone();
    } catch (e) {
      dispatch(notify('error', errorText(e)));
    }
  }
  return (
    <div className="dialog-backdrop">
      <form className="dialog" onSubmit={handleSubmit(onSubmit)} aria-label="Nuevo usuario" noValidate>
        <span className="dialog-title">Nuevo usuario</span>
        <div className="field">
          <label htmlFor="f-name">Nombre</label>
          <input className="input" id="f-name" {...register('name')} />
          {errors.name && <span className="field-error">{errors.name.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="f-email">Email</label>
          <input className="input" id="f-email" placeholder="nombre@toka.local" {...register('email')} />
          {errors.email && <span className="field-error">{errors.email.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="f-pw">Contraseña</label>
          <input className="input" id="f-pw" type="password" autoComplete="new-password" {...register('password')} />
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="f-role">Rol</label>
          {roles.length > 0 ? (
            <RoleSelect id="f-role" roles={roles} {...register('roleId')} />
          ) : (
            <input className="input" id="f-role" placeholder="ID de rol" {...register('roleId')} />
          )}
          {errors.roleId && <span className="field-error">{errors.roleId.message}</span>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onDone}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            Crear usuario
          </button>
        </div>
      </form>
    </div>
  );
}

function EditDialog({ user, roles, onDone }: { user: User; roles: RoleOpt[]; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const [update, updateState] = useUpdateUserMutation();
  const [assign, assignState] = useAssignRoleMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: user.name, email: user.email, roleId: user.roleId },
  });
  async function onSubmit(v: EditValues) {
    try {
      await update({ id: user.id, name: v.name, email: v.email }).unwrap();
      if (v.roleId !== user.roleId) await assign({ id: user.id, roleId: v.roleId }).unwrap();
      dispatch(notify('success', 'Usuario actualizado'));
      onDone();
    } catch (e) {
      dispatch(notify('error', errorText(e)));
    }
  }
  return (
    <div className="dialog-backdrop">
      <form className="dialog" onSubmit={handleSubmit(onSubmit)} aria-label="Editar usuario" noValidate>
        <span className="dialog-title">Editar usuario</span>
        <div className="field">
          <label htmlFor="e-name">Nombre</label>
          <input className="input" id="e-name" {...register('name')} />
          {errors.name && <span className="field-error">{errors.name.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="e-email">Email</label>
          <input className="input" id="e-email" {...register('email')} />
          {errors.email && <span className="field-error">{errors.email.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="e-role">Rol</label>
          {roles.length > 0 ? (
            <RoleSelect id="e-role" roles={roles} {...register('roleId')} />
          ) : (
            <input className="input" id="e-role" {...register('roleId')} />
          )}
          {errors.roleId && <span className="field-error">{errors.roleId.message}</span>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onDone}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={updateState.isLoading || assignState.isLoading}>
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  );
}

export function UsersPage() {
  const dispatch = useAppDispatch();
  const canWrite = useCan(PERMISSIONS.USERS_WRITE);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const limit = 10;
  const { data, isLoading, error } = useGetUsersQuery({ page, limit });
  const { data: roleData } = useGetRoleOptionsQuery();
  const granted = useAppSelector((st) => st.session.user?.permissions);
  const allRoles = Array.isArray(roleData) ? roleData : [];
  // UX only (server enforces): offer roles whose permissions are a subset of the current user's.
  const roles = allRoles.filter((r) => (granted ?? []).includes(WILDCARD) || r.permissions.every((p) => p !== WILDCARD && hasPermission(granted, p)));
  const [remove] = useDeleteUserMutation();
  const [assign] = useAssignRoleMutation();
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await remove(toDelete.id).unwrap();
      dispatch(notify('success', 'Usuario eliminado'));
    } catch (e) {
      dispatch(notify('error', errorText(e)));
    }
    setToDelete(null);
  }
  async function changeRole(id: string, roleId: string) {
    try {
      await assign({ id, roleId }).unwrap();
      dispatch(notify('success', 'Rol asignado'));
    } catch (e) {
      dispatch(notify('error', errorText(e)));
    }
  }

  const roleName = (id: string) => allRoles.find((r) => r.id === id)?.name ?? id;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const q = query.trim().toLowerCase();
  const rows = (data?.items ?? []).filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q));
  const total = data?.total ?? 0;

  return (
    <section className="users-page">
      <header className="users-header">
        <div className="users-heading">
          <div className="accent-bar" />
          <h1>Usuarios</h1>
          <span className="users-count">
            {total} {total === 1 ? 'usuario' : 'usuarios'}
          </span>
        </div>
        <input
          className="input users-search"
          type="search"
          placeholder="Buscar por nombre o email"
          aria-label="Buscar usuarios"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {canWrite && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            + Nuevo usuario
          </button>
        )}
      </header>
      {isLoading && <Spinner />}
      {error && <ErrorMessage error={error} />}
      {data && data.items.length === 0 && <p>No hay usuarios.</p>}
      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                {canWrite && <th className="col-actions">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <span className="avatar" aria-hidden="true">
                        {initials(u.name)}
                      </span>
                      <div className="user-cell-text">
                        <span>{u.name}</span>
                        <span className="user-email">{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    {canWrite && roles.length > 0 ? (
                      <select
                        className="input input-sm"
                        aria-label={`Rol de ${u.name}`}
                        value={u.roleId}
                        onChange={(e) => changeRole(u.id, e.target.value)}
                      >
                        {allRoles
                          .filter((r) => r.id === u.roleId || roles.some((o) => o.id === r.id))
                          .map((r) => (
                            <option key={r.id} value={r.id} disabled={!roles.some((o) => o.id === r.id)}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span className="tag tag-neutral">{roleName(u.roleId)}</span>
                    )}
                  </td>
                  <td>
                    <span className={`tag ${STATUS[u.status]?.cls ?? 'tag-neutral'}`}>{STATUS[u.status]?.label ?? u.status}</span>
                  </td>
                  {canWrite && (
                    <td>
                      <span className="row-actions row-actions-end">
                        <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" title="Editar" aria-label={`Editar ${u.name}`} onClick={() => setEditing(u)}>
                          <PencilIcon />
                        </button>
                        <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" title="Eliminar" aria-label={`Eliminar ${u.name}`} onClick={() => setToDelete(u)}>
                          <TrashIcon />
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="users-empty">Ningún usuario coincide con la búsqueda.</p>}
        </div>
      )}
      <footer className="pager">
        <span className="pager-info">
          Página {page} de {pages}
        </span>
        <button type="button" className="btn btn-secondary btn-icon btn-icon-sm" aria-label="Anterior" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          ‹
        </button>
        <button type="button" className="btn btn-secondary btn-icon btn-icon-sm" aria-label="Siguiente" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          ›
        </button>
      </footer>
      {canWrite && editing && <EditDialog key={editing.id} user={editing} roles={roles} onDone={() => setEditing(null)} />}
      {canWrite && creating && <CreateDialog roles={roles} onDone={() => setCreating(false)} />}
      {toDelete && (
        <ConfirmDialog message={`¿Eliminar a ${toDelete.name}?`} onConfirm={confirmDelete} onCancel={() => setToDelete(null)} />
      )}
    </section>
  );
}
