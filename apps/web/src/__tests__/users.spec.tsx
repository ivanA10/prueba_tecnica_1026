import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { UsersPage } from '@/features/users/UsersPage';
import { mockFetch, renderApp, type Handler } from '../../test/helpers';
import { Toaster } from '@/components/shared';

const roles = [
  { id: 'r1', name: 'admin', permissions: ['*'] },
  { id: 'r2', name: 'user', permissions: [] },
];
const users = [{ id: 'u1', name: 'Ana', email: 'ana@x.com', roleId: 'r2', status: 'ACTIVE' }];

function server(extra?: Handler) {
  const state = { users: [...users] };
  const fn = mockFetch((req) => {
    const custom = extra?.(req);
    if (custom) return custom;
    if (req.url.startsWith('/roles')) return { body: roles };
    if (req.url.startsWith('/users') && req.method === 'GET') {
      return { body: { items: state.users, page: 1, limit: 10, total: state.users.length } };
    }
    if (req.method === 'POST') {
      state.users = [...state.users, { id: 'u2', name: 'Bob', email: 'b@x.com', roleId: 'r1', status: 'ACTIVE' }];
      return { status: 201, body: state.users[1] };
    }
    if (req.method === 'DELETE') {
      state.users = [];
      return { status: 200, body: {} };
    }
    return { body: {} };
  });
  return fn;
}

const ui = (
  <>
    <UsersPage />
    <Toaster />
  </>
);

describe('users', () => {
  it('lists rows with the role name and status', async () => {
    server();
    renderApp(ui);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('ana@x.com')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('shows the list error', async () => {
    server(({ url }) => (url.startsWith('/users') ? { status: 500, body: { message: 'boom' } } : undefined));
    renderApp(ui);
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('shows 403 roles as plain roleId and hides write actions for non-admin', async () => {
    server(({ url }) => (url.startsWith('/roles') ? { status: 403, body: {} } : undefined));
    renderApp(ui, { admin: false });
    expect(await screen.findByText('r2')).toBeInTheDocument();
    expect(screen.queryByText('Nuevo usuario')).not.toBeInTheDocument();
  });

  it('validates the create form without POST, then creates with toast', async () => {
    const f = server();
    renderApp(ui);
    await screen.findByText('ana@x.com');
    const form = screen.getByRole('form', { name: 'Nuevo usuario' });
    fireEvent.click(within(form).getByRole('button', { name: 'Crear' }));
    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument();
    expect(f.mock.calls.some((c) => (c[0] as Request).method === 'POST')).toBe(false);

    fireEvent.change(within(form).getByLabelText('Nombre'), { target: { value: 'Bob' } });
    fireEvent.change(within(form).getByLabelText('Email'), { target: { value: 'b@x.com' } });
    fireEvent.change(within(form).getByLabelText('Contrasena'), { target: { value: '12345678' } });
    fireEvent.change(within(form).getByLabelText('Rol'), { target: { value: 'r1' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Crear' }));
    expect(await screen.findByText(/Usuario creado/)).toBeInTheDocument();
    expect(await screen.findByText('b@x.com')).toBeInTheDocument();
  });

  it('deletes after confirmation', async () => {
    server();
    renderApp(ui);
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Ana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/Usuario eliminado/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No hay usuarios.')).toBeInTheDocument());
  });

  it('assigns a role and edits a user', async () => {
    const f = server();
    renderApp(ui);
    fireEvent.change(await screen.findByLabelText('Rol de Ana'), { target: { value: 'r1' } });
    expect(await screen.findByText(/Rol asignado/)).toBeInTheDocument();
    const put = f.mock.calls.map((c) => c[0] as Request).find((r) => r.method === 'PUT');
    expect(put?.url).toContain('/users/u1/role');

    fireEvent.click(screen.getByRole('button', { name: 'Editar Ana' }));
    const form = screen.getByRole('form', { name: 'Editar usuario' });
    fireEvent.change(within(form).getByLabelText('Nombre'), { target: { value: 'Ana B' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/Usuario actualizado/)).toBeInTheDocument();
  });
});
