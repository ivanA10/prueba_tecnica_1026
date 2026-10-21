import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { PERMISSIONS } from '@toka/contracts';
import { useLogoutMutation } from '@/api/auth';
import { useAppDispatch, useAppSelector, useCan } from '@/store/hooks';
import { clearSession } from '@/store/session';
import { Spinner } from './shared';

export function RequireAuth() {
  const status = useAppSelector((s) => s.session.status);
  if (status === 'unknown') return <Spinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return <Layout />;
}

export function Layout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [logout] = useLogoutMutation();
  const canUsers = useCan(PERMISSIONS.USERS_READ);
  const canRoles = useCan(PERMISSIONS.ROLES_READ);
  const canAudit = useCan(PERMISSIONS.AUDIT_READ);
  const canAgent = useCan(PERMISSIONS.AGENT_ASK);
  async function onLogout() {
    await logout();
    dispatch(clearSession());
    navigate('/login');
  }
  return (
    <>
      <nav className="nav" aria-label="Principal">
        <NavLink to="/" end className="nav-brand">
          Toka
        </NavLink>
        <NavLink to="/" end>Inicio</NavLink>
        {canUsers && <NavLink to="/users">Usuarios</NavLink>}
        {canRoles && <NavLink to="/roles">Roles</NavLink>}
        {canRoles && <NavLink to="/permissions">Permisos</NavLink>}
        {canAudit && <NavLink to="/audit">Auditoría</NavLink>}
        {canAgent && <NavLink to="/agent">Agente</NavLink>}
        <button type="button" className="btn btn-secondary" onClick={onLogout}>
          Salir
        </button>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </>
  );
}
