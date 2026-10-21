import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLogoutMutation } from '@/api/auth';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearSession } from '@/store/session';
import { Spinner } from './shared';

export function RequireAuth() {
  const status = useAppSelector((s) => s.session.status);
  if (status === 'unknown') return <Spinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return <Layout />;
}

export function isAdmin(roles: string[] | undefined): boolean {
  return !!roles?.some((r) => r.toLowerCase() === 'admin');
}

export function Layout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [logout] = useLogoutMutation();
  async function onLogout() {
    await logout();
    dispatch(clearSession());
    navigate('/login');
  }
  return (
    <>
      <nav aria-label="Principal">
        <NavLink to="/users">Usuarios</NavLink>
        <NavLink to="/roles">Roles</NavLink>
        <NavLink to="/audit">Auditoria</NavLink>
        <NavLink to="/agent">Agente</NavLink>
        <button type="button" onClick={onLogout}>
          Salir
        </button>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}
