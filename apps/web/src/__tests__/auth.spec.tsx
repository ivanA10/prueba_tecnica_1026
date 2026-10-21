import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { RequireAuth } from '@/components/Layout';
import { Toaster, ErrorMessage } from '@/components/shared';
import { notify } from '@/store/notifications';
import { adminToken, mockFetch, renderApp } from '../../test/helpers';

function routes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<p>app home</p>} />
      <Route element={<RequireAuth />}>
        <Route path="/private" element={<p>secret</p>} />
      </Route>
    </Routes>
  );
}

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('auth', () => {
  it('validates without calling fetch', async () => {
    const f = mockFetch(() => undefined);
    renderApp(routes(), { route: '/login', token: null });
    fill('bad', '');
    expect(await screen.findByText('Email inválido')).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it('logs in and navigates', async () => {
    mockFetch(() => ({ body: { accessToken: adminToken, expiresIn: 900 } }));
    const { store } = renderApp(routes(), { route: '/login', token: null });
    fill('a@b.com', 'secret');
    expect(await screen.findByText('app home')).toBeInTheDocument();
    expect(store.getState().session.status).toBe('authenticated');
  });

  it('shows the 401 message', async () => {
    mockFetch(() => ({ status: 401, body: { message: 'Credenciales inválidas' } }));
    renderApp(routes(), { route: '/login', token: null });
    fill('a@b.com', 'secret');
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
  });

  it('RequireAuth waits on unknown, redirects when anonymous, renders when authenticated', async () => {
    mockFetch(() => undefined);
    const unknown = renderApp(routes(), { route: '/private', token: null });
    expect(screen.getByRole('status')).toBeInTheDocument();
    unknown.unmount();
    const { store } = renderApp(routes(), { route: '/private', token: null });
    store.dispatch({ type: 'session/clearSession' });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument());
    renderApp(routes(), { route: '/private' });
    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  it('Toaster shows and closes a notification; ErrorMessage joins arrays', async () => {
    const { store } = renderApp(
      <>
        <Toaster />
        <ErrorMessage error={{ status: 400, data: { message: ['a', 'b'] } }} />
        <ErrorMessage error={{ status: 403 }} />
      </>,
    );
    store.dispatch(notify('success', 'Hecho'));
    expect(await screen.findByText(/Hecho/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByText(/Hecho/)).not.toBeInTheDocument());
    expect(screen.getByText('a, b')).toBeInTheDocument();
    expect(screen.getByText(/403/)).toBeInTheDocument();
  });
});
