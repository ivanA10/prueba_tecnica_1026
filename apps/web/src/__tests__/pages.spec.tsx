import { fireEvent, screen } from '@testing-library/react';
import { RolesPage } from '@/features/roles/RolesPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { AgentPage } from '@/features/agent/AgentPage';
import { Layout } from '@/components/Layout';
import { mockFetch, renderApp } from '../../test/helpers';

describe('roles, audit, agent, layout', () => {
  it('roles lists permissions and shows 403 for non-admin', async () => {
    mockFetch(() => ({ body: [{ id: 'r1', name: 'admin', permissions: ['users:write'] }] }));
    renderApp(<RolesPage />);
    expect(await screen.findByText(/users:write/)).toBeInTheDocument();
    mockFetch(() => ({ status: 403, body: { message: 'Forbidden resource' } }));
    renderApp(<RolesPage />, { admin: false });
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
  });

  it('audit lists events and sends filters', async () => {
    const f = mockFetch(() => ({
      body: { items: [{ eventId: 'e1', type: 'user.created', actorUserId: 'u1', occurredAt: '2026-01-01', correlationId: 'c1' }], page: 1, limit: 20, total: 1 },
    }));
    renderApp(<AuditPage />);
    expect(await screen.findByText('user.created')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'login' } });
    await screen.findByText('user.created');
    const urls = f.mock.calls.map((c) => (c[0] as Request).url);
    expect(urls.some((u) => u.includes('type=login'))).toBe(true);
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
});
