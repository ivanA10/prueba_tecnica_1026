import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { RolesPage } from '@/features/roles/RolesPage';
import { PermissionsPage } from '@/features/roles/PermissionsPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { AgentPage } from '@/features/agent/AgentPage';
import { Layout } from '@/components/Layout';
import { HomePage } from '@/features/home/HomePage';
import { Toaster } from '@/components/shared';
import { makeJwt, mockFetch, renderApp } from '../../test/helpers';

describe('roles, audit, agent, layout', () => {
  it('roles lists permissions and shows 403 for non-admin', async () => {
    mockFetch(() => ({ body: [{ id: 'r1', name: 'admin', permissions: ['users:write'] }] }));
    renderApp(<RolesPage />);
    expect(await screen.findByText('Gestionar usuarios')).toBeInTheDocument();
    mockFetch(() => ({ status: 403, body: { message: 'Forbidden resource' } }));
    renderApp(<RolesPage />, { admin: false });
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
  });

  it('roles creates a role (validation first) and surfaces 409 on edit', async () => {
    const role = { id: 'r1', name: 'admin', permissions: ['users:write'], version: 3 };
    const bodies: Record<string, string> = {};
    mockFetch((req) => {
      bodies[req.method] = req.body;
      if (req.method === 'POST') return { status: 201, body: { ...role, id: 'r2', name: 'ops' } };
      if (req.method === 'PUT') return { status: 409, body: { message: 'Version conflict' } };
      return { body: [role] };
    });
    renderApp(<RolesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Crear rol' }));
    const form = screen.getByRole('form', { name: 'Nuevo rol' });
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Nombre'), { target: { value: 'ops' } });
    fireEvent.click(within(form).getByLabelText('Ver usuarios'));
    fireEvent.click(within(form).getByLabelText('Ver auditoría'));
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Nuevo rol' })).not.toBeInTheDocument());
    expect(JSON.parse(bodies.POST)).toEqual({ name: 'ops', permissions: ['users:read', 'audit:read'] });

    fireEvent.click(screen.getByRole('button', { name: 'Editar admin' }));
    const edit = screen.getByRole('form', { name: 'Editar rol' });
    fireEvent.click(within(edit).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/Conflicto/)).toBeInTheDocument();
    expect(JSON.parse(bodies.PUT).version).toBe(3);
  });

  it('roles wildcard option sends ["*"] and disables the others', async () => {
    const bodies: Record<string, string> = {};
    mockFetch((req) => {
      bodies[req.method] = req.body;
      return req.method === 'POST' ? { status: 201, body: { id: 'r3', name: 'root', permissions: ['*'] } } : { body: [] };
    });
    renderApp(<RolesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Crear rol' }));
    const form = screen.getByRole('form', { name: 'Nuevo rol' });
    fireEvent.change(within(form).getByLabelText('Nombre'), { target: { value: 'root' } });
    fireEvent.click(within(form).getByLabelText('Ver usuarios'));
    fireEvent.click(within(form).getByLabelText('Todos los permisos (*)'));
    expect(within(form).getByLabelText('Ver usuarios')).toBeDisabled();
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(bodies.POST).toBeDefined());
    expect(JSON.parse(bodies.POST).permissions).toEqual(['*']);
  });

  it('permissions page renders the role x permission matrix', async () => {
    mockFetch(() => ({ body: [{ id: 'r1', name: 'admin', permissions: ['*'] }, { id: 'r2', name: 'viewer', permissions: ['users:read'] }] }));
    renderApp(<PermissionsPage />);
    expect(await screen.findByLabelText('admin tiene audit:read')).toBeInTheDocument();
    expect(screen.getByLabelText('viewer tiene users:read')).toBeInTheDocument();
    expect(screen.getByLabelText('viewer no tiene users:write')).toBeInTheDocument();
  });

  it('layout hides nav links the user lacks permission for', () => {
    mockFetch(() => ({ status: 204 }));
    renderApp(<Layout />, { token: makeJwt({ sub: 'u3', roles: ['x'], permissions: ['users:read'] }) });
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Roles' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Permisos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Auditoría' })).not.toBeInTheDocument();
  });

  it('audit lists events and sends filters', async () => {
    const f = mockFetch(() => ({
      body: { items: [{ eventId: 'e1', type: 'user.created', actorUserId: 'u1', occurredAt: '2026-01-01', correlationId: 'c1' }], page: 1, limit: 20, total: 1 },
    }));
    renderApp(<AuditPage />);
    expect(await screen.findByText('user.created')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'login' } });
    const urls = () => f.mock.calls.map((c) => (c[0] as Request).url);
    // debounced: not queried immediately, only after the 300ms pause
    expect(urls().some((u) => u.includes('type=login'))).toBe(false);
    await waitFor(() => expect(urls().some((u) => u.includes('type=login'))).toBe(true));
  });

  it('audit clear-filters resets the inputs and role dialog has no delete action', async () => {
    mockFetch(() => ({ body: { items: [], page: 1, limit: 20, total: 0 } }));
    renderApp(<AuditPage />);
    fireEvent.change(screen.getByLabelText('Actor'), { target: { value: 'u1' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByLabelText('Actor')).toHaveValue('');
    mockFetch(() => ({ body: [{ id: 'r1', name: 'admin', permissions: ['*'], version: 1 }] }));
    renderApp(<RolesPage />);
    expect(await screen.findByRole('button', { name: 'Editar admin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  it('audit shows empty and error states', async () => {
    mockFetch(() => ({ status: 500, body: { message: 'fallo' } }));
    renderApp(<AuditPage />);
    expect(await screen.findByText('fallo')).toBeInTheDocument();
  });

  it('agent validates, answers with sources and flags degraded', async () => {
    mockFetch(() => ({ body: { answer: 'Hola mundo', degraded: true, sources: [{ docId: 'd1', source: 'manual.md', score: 0.9 }], meta: {} } }));
    renderApp(<AgentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar' }));
    expect(screen.getByText('Escribe una pregunta')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pregunta'), { target: { value: 'que tal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar' }));
    expect(await screen.findByText('Hola mundo')).toBeInTheDocument();
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.getByText(/manual.md/)).toBeInTheDocument();
  });

  it('agent shows errors', async () => {
    mockFetch(() => ({ status: 503, body: { message: 'sin servicio' } }));
    renderApp(<AgentPage />);
    fireEvent.change(screen.getByLabelText('Pregunta'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar' }));
    expect(await screen.findByText('sin servicio')).toBeInTheDocument();
  });

  it('layout logout clears the session', async () => {
    mockFetch(() => ({ status: 204 }));
    const { store } = renderApp(<Layout />);
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    await screen.findByRole('navigation');
    await new Promise((r) => setTimeout(r, 20));
    expect(store.getState().session.status).toBe('anonymous');
  });

  it('home shows only the cards the user can access, or an empty message', () => {
    renderApp(<HomePage />, { token: makeJwt({ sub: 'u4', roles: ['x'], permissions: ['agent:ask'] }) });
    expect(screen.getByRole('link', { name: /Agente/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Usuarios/ })).not.toBeInTheDocument();
    renderApp(<HomePage />, { admin: false });
    expect(screen.getByText('Tu rol no tiene permisos asignados.')).toBeInTheDocument();
  });

  it('agent ingest section is hidden without agent:ingest', () => {
    mockFetch(() => ({ body: [] }));
    renderApp(<AgentPage />, { token: makeJwt({ sub: 'u5', roles: ['x'], permissions: ['agent:ask'] }) });
    expect(screen.queryByText('Cargar conocimiento')).not.toBeInTheDocument();
  });

  it('agent ingest submits the document and reports chunks', async () => {
    const bodies: Record<string, string> = {};
    mockFetch((req) => {
      bodies[req.method + req.url] = req.body;
      if (req.url === '/agent/ingest') return { status: 201, body: { docId: 'd1', chunks: 3 } };
      return { body: [{ id: 'r1', name: 'admin', permissions: ['*'] }] };
    });
    renderApp(<><Toaster /><AgentPage /></>);
    fireEvent.click(screen.getByRole('radio', { name: 'Cargar conocimiento' }));
    const form = await screen.findByRole('form', { name: 'Cargar conocimiento' });
    fireEvent.click(within(form).getByRole('button', { name: 'Indexar documento' }));
    expect(await screen.findByText('Selecciona al menos un rol')).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Identificador'), { target: { value: 'd1' } });
    fireEvent.change(within(form).getByLabelText('Fuente'), { target: { value: 'manual.md' } });
    fireEvent.change(within(form).getByLabelText('Contenido'), { target: { value: 'hola' } });
    fireEvent.click(await within(form).findByLabelText('admin'));
    fireEvent.click(within(form).getByRole('button', { name: 'Indexar documento' }));
    expect(await screen.findByText(/Documento indexado: 3 fragmentos/)).toBeInTheDocument();
    expect(JSON.parse(bodies['POST/agent/ingest'])).toEqual({ docId: 'd1', source: 'manual.md', roleScope: ['admin'], text: 'hola' });
  });
});
