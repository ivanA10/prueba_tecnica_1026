import { Link } from 'react-router-dom';
import { PERMISSIONS } from '@toka/contracts';
import { useCan } from '@/store/hooks';

export function HomePage() {
  const sections = [
    { to: '/users', title: 'Usuarios', text: 'Gestiona las cuentas de usuario.', ok: useCan(PERMISSIONS.USERS_READ) },
    { to: '/roles', title: 'Roles', text: 'Administra roles y sus permisos.', ok: useCan(PERMISSIONS.ROLES_READ) },
    { to: '/permissions', title: 'Permisos', text: 'Consulta la matriz de permisos por rol.', ok: useCan(PERMISSIONS.ROLES_READ) },
    { to: '/audit', title: 'Auditoría', text: 'Revisa los eventos del sistema.', ok: useCan(PERMISSIONS.AUDIT_READ) },
    { to: '/agent', title: 'Agente', text: 'Haz preguntas al asistente de conocimiento.', ok: useCan(PERMISSIONS.AGENT_ASK) },
  ].filter((s) => s.ok);

  return (
    <section className="users-page">
      <header className="users-header">
        <div className="users-heading">
          <div className="accent-bar" />
          <h1>Inicio</h1>
        </div>
      </header>
      {sections.length === 0 ? (
        <p>Tu rol no tiene permisos asignados.</p>
      ) : (
        <div className="home-grid">
          {sections.map((s) => (
            <Link key={s.to} to={s.to} className="card home-card">
              <strong>{s.title}</strong>
              <span className="card-meta">{s.text}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
