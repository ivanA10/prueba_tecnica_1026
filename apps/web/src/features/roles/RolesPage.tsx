import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ALL_PERMISSIONS, PERMISSIONS, hasPermission, PERMISSION_LABELS, WILDCARD } from '@toka/contracts';
import { useCreateRoleMutation, useGetRolesQuery, useUpdateRoleMutation } from '@/api/roles';
import type { Role } from '@/api/types';
import { ErrorMessage, Spinner, errorText } from '@/components/shared';
import { BadgeIcon, CloseIcon, CrownIcon, PencilIcon, PlusIcon } from '@/components/icons';
import { useAppDispatch, useAppSelector, useCan } from '@/store/hooks';
import { notify } from '@/store/notifications';

export const roleSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres'),
  description: z.string().max(500, 'Máximo 500 caracteres').optional(),
  permissions: z.array(z.string()),
});
type RoleValues = z.infer<typeof roleSchema>;

export const permissionLabel = (p: string): string =>
  p === WILDCARD ? 'Todos los permisos (*)' : (PERMISSION_LABELS as Record<string, string>)[p] ?? p;

type Perm = (typeof ALL_PERMISSIONS)[number];
export const GROUP_LABELS: Record<string, string> = { users: 'Usuarios', roles: 'Roles', audit: 'Auditoría', agent: 'Agente' };

/** Groups the permission catalog by its resource prefix (users:read -> users). */
export function permissionGroups(): { key: string; label: string; perms: Perm[] }[] {
  const map = new Map<string, Perm[]>();
  for (const p of ALL_PERMISSIONS) {
    const k = p.split(':')[0];
    map.set(k, [...(map.get(k) ?? []), p]);
  }
  return [...map.entries()].map(([key, perms]) => ({ key, label: GROUP_LABELS[key] ?? key, perms }));
}

function RoleForm({ role, onDone }: { role?: Role; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const [create, createState] = useCreateRoleMutation();
  const [update, updateState] = useUpdateRoleMutation();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RoleValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissions: role?.permissions ?? [],
    },
  });
  const isLoading = createState.isLoading || updateState.isLoading;
  const [conflict, setConflict] = useState('');
  const canAll = useCan(WILDCARD);
  const granted = useAppSelector((st) => st.session.user?.permissions);
  const selected = watch('permissions') ?? [];
  const all = selected.includes(WILDCARD);
  const selCount = all ? ALL_PERMISSIONS.length : selected.filter((p) => p !== WILDCARD).length;
  const groups = permissionGroups();

  async function onSubmit(v: RoleValues) {
    setConflict('');
    const permissions = v.permissions.includes(WILDCARD) ? [WILDCARD] : v.permissions;
    const body = { name: v.name, description: v.description || undefined, permissions };
    try {
      if (role) {
        await update({ id: role.id, ...body, version: role.version }).unwrap();
        dispatch(notify('success', 'Rol actualizado'));
      } else {
        await create(body).unwrap();
        dispatch(notify('success', 'Rol creado'));
      }
      onDone();
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        setConflict('Conflicto: el rol fue modificado por otra persona. Cierra el formulario y recarga la lista antes de editar de nuevo.');
      } else {
        dispatch(notify('error', errorText(e)));
      }
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onDone}>
      <form
        className="dialog dialog-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit(onSubmit)}
        aria-label={role ? 'Editar rol' : 'Nuevo rol'}
        noValidate
      >
        <div className="dialog-head">
          <span className="dialog-title">{role ? 'Editar rol' : 'Nuevo rol'}</span>
          <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" aria-label="Cerrar" onClick={onDone}>
            <CloseIcon />
          </button>
        </div>
        <div className="dialog-grid">
          <div className="field">
            <label htmlFor="r-name">Nombre</label>
            <input className="input" id="r-name" placeholder="operador" {...register('name')} aria-invalid={!!errors.name} />
            {errors.name && <span className="field-error">{errors.name.message}</span>}
          </div>
          <div className="field">
            <label htmlFor="r-desc">Descripción</label>
            <input className="input" id="r-desc" placeholder="Para qué sirve este rol" {...register('description')} />
            {errors.description && <span className="field-error">{errors.description.message}</span>}
          </div>
        </div>
        <fieldset className="perm-fieldset">
          <div className="perm-legend-row">
            <legend>Permisos</legend>
            <span className="perm-count">
              {selCount} de {ALL_PERMISSIONS.length}
            </span>
          </div>
          <div className="perm-all">
            <input id="r-all" type="checkbox" value={WILDCARD} disabled={!canAll} {...register('permissions')} />
            <span>
              <label htmlFor="r-all">Todos los permisos (*)</label>
              <span className="perm-hint">Acceso total, incluidos permisos futuros</span>
            </span>
          </div>
          <div className={`perm-groups${all ? ' is-all' : ''}`}>
            {groups.map((g) => (
              <div key={g.key} className="perm-group">
                <span className="perm-group-label">{g.label}</span>
                <div className="perm-options">
                  {g.perms.map((p) => (
                    <label key={p}>
                      <input type="checkbox" value={p} disabled={all || !(canAll || hasPermission(granted, p))} {...register('permissions')} />
                      {PERMISSION_LABELS[p]}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
        {conflict && (
          <p role="alert" className="error">
            {conflict}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onDone}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

export function RolesPage() {
  const { data, isLoading, error } = useGetRolesQuery();
  const canWrite = useCan(PERMISSIONS.ROLES_WRITE);
  const [mode, setMode] = useState<{ role?: Role } | null>(null);
  const count = Array.isArray(data) ? data.length : 0;
  return (
    <section className="page">
      <header className="page-header">
        <div className="users-heading">
          <div className="accent-bar" />
          <h1>Roles</h1>
          <span className="users-count">
            {count} {count === 1 ? 'rol' : 'roles'}
          </span>
        </div>
        {canWrite && (
          <button type="button" className="btn btn-primary" onClick={() => setMode({})}>
            <PlusIcon />
            Crear rol
          </button>
        )}
      </header>
      {isLoading && <Spinner />}
      {error && <ErrorMessage error={error} />}
      {Array.isArray(data) && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 240 }}>Rol</th>
                <th>Permisos</th>
                {canWrite && <th className="col-actions">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="role-cell">
                      <span className="role-icon" aria-hidden="true">
                        {r.permissions.includes(WILDCARD) ? <CrownIcon /> : <BadgeIcon />}
                      </span>
                      <div className="user-cell-text">
                        <span>{r.name}</span>
                        {r.description && <span className="user-email">{r.description}</span>}
                      </div>
                    </div>
                  </td>
                  <td>
                    {r.permissions.length === 0 ? (
                      <span className="tag tag-neutral">Sin permisos</span>
                    ) : (
                      <span className="tag-list">
                        {r.permissions.map((p) => (
                          <span key={p} className={`tag ${p === WILDCARD ? 'tag-outline' : 'tag-neutral'}`}>
                            {permissionLabel(p)}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  {canWrite && (
                    <td>
                      <span className="row-actions row-actions-end">
                        <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" title="Editar" aria-label={`Editar ${r.name}`} onClick={() => setMode({ role: r })}>
                          <PencilIcon />
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && mode && <RoleForm key={mode.role?.id ?? 'new'} role={mode.role} onDone={() => setMode(null)} />}
    </section>
  );
}
