import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { isAdmin } from '@/components/Layout';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { notify } from '@/store/notifications';

export const userSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'Minimo 8 caracteres'),
  roleId: z.string().min(1, 'El rol es obligatorio'),
});
type UserValues = z.infer<typeof userSchema>;

const editSchema = userSchema.pick({ name: true, email: true });
type EditValues = z.infer<typeof editSchema>;

function EditForm({ user, onDone }: { user: User; onDone: () => void }) {
  const dispatch = useAppDispatch();
  const [update, { isLoading }] = useUpdateUserMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditValues>({ resolver: zodResolver(editSchema), defaultValues: { name: user.name, email: user.email } });
  async function onSubmit(v: EditValues) {
    try {
      await update({ id: user.id, ...v }).unwrap();
      dispatch(notify('success', 'Usuario actualizado'));
      onDone();
    } catch (e) {
      dispatch(notify('error', errorText(e)));
    }
  }
  return (
    <form onSubmit={handleSubmit(onSubmit)} aria-label="Editar usuario" noValidate>
      <label>
        Nombre
        <input {...register('name')} />
      </label>
      {errors.name && <span className="field-error">{errors.name.message}</span>}
      <label>
        Email
        <input {...register('email')} />
      </label>
      {errors.email && <span className="field-error">{errors.email.message}</span>}
      <button type="submit" disabled={isLoading}>
        Guardar
      </button>
      <button type="button" onClick={onDone}>
        Cancelar
      </button>
    </form>
  );
}

function CreateForm({ roles }: { roles: { id: string; name: string }[] }) {
  const dispatch = useAppDispatch();
  const [create, { isLoading }] = useCreateUserMutation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserValues>({ resolver: zodResolver(userSchema), defaultValues: { roleId: '' } });
  async function onSubmit(v: UserValues) {
    try {
      await create(v).unwrap();
      dispatch(notify('success', 'Usuario creado'));
      reset();
    } catch (e) {
      dispatch(notify('error', errorText(e)));
    }
  }
  return (
    <form onSubmit={handleSubmit(onSubmit)} aria-label="Nuevo usuario" noValidate>
      <h2>Nuevo usuario</h2>
      <label>
        Nombre
        <input {...register('name')} />
      </label>
      {errors.name && <span className="field-error">{errors.name.message}</span>}
      <label>
        Email
        <input {...register('email')} />
      </label>
      {errors.email && <span className="field-error">{errors.email.message}</span>}
      <label>
        Contrasena
        <input type="password" {...register('password')} />
      </label>
      {errors.password && <span className="field-error">{errors.password.message}</span>}
      <label>
        Rol
        {roles.length > 0 ? (
          <select {...register('roleId')}>
            <option value="">Selecciona...</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <input {...register('roleId')} placeholder="ID de rol" />
        )}
      </label>
      {errors.roleId && <span className="field-error">{errors.roleId.message}</span>}
      <button type="submit" disabled={isLoading}>
        Crear
      </button>
    </form>
  );
}

export function UsersPage() {
  const dispatch = useAppDispatch();
  const admin = isAdmin(useAppSelector((s) => s.session.user?.roles));
  const [page, setPage] = useState(1);
  const limit = 10;
  const { data, isLoading, error } = useGetUsersQuery({ page, limit });
  const { data: roleData } = useGetRoleOptionsQuery();
  const roles = Array.isArray(roleData) ? roleData : [];
  const [remove] = useDeleteUserMutation();
  const [assign] = useAssignRoleMutation();
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);

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

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <section>
      <h1>Usuarios</h1>
      {isLoading && <Spinner />}
      {error && <ErrorMessage error={error} />}
      {data && data.items.length === 0 && <p>No hay usuarios.</p>}
      {data && data.items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Estado</th>
              {admin && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {data.items.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  {admin && roles.length > 0 ? (
                    <select aria-label={`Rol de ${u.name}`} value={u.roleId} onChange={(e) => changeRole(u.id, e.target.value)}>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    roleName(u.roleId)
                  )}
                </td>
                <td>{u.status}</td>
                {admin && (
                  <td>
                    <button type="button" onClick={() => setEditing(u)}>
                      Editar {u.name}
                    </button>
                    <button type="button" onClick={() => setToDelete(u)}>
                      Eliminar {u.name}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div>
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span>
          Pagina {page} de {pages}
        </span>
        <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Siguiente
        </button>
      </div>
      {admin && editing && <EditForm key={editing.id} user={editing} onDone={() => setEditing(null)} />}
      {admin && <CreateForm roles={roles} />}
      {toDelete && (
        <ConfirmDialog message={`Eliminar a ${toDelete.name}?`} onConfirm={confirmDelete} onCancel={() => setToDelete(null)} />
      )}
    </section>
  );
}
