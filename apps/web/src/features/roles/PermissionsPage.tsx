import { Link } from 'react-router-dom';
import { PERMISSION_LABELS, PERMISSIONS, WILDCARD } from '@toka/contracts';
import { useGetRolesQuery } from '@/api/roles';
import { CheckIcon, CrownIcon, MinusIcon, PencilIcon } from '@/components/icons';
import { ErrorMessage, Spinner } from '@/components/shared';
import { useCan } from '@/store/hooks';
import { permissionGroups } from './RolesPage';

export function PermissionsPage() {
  const { data, isLoading, error } = useGetRolesQuery();
  const canWrite = useCan(PERMISSIONS.ROLES_WRITE);
  const roles = Array.isArray(data) ? data : [];
  const groups = permissionGroups();
  const total = groups.reduce((n, g) => n + g.perms.length, 0);
  return (
    <section className="page">
      <header className="page-header">
        <div className="users-heading">
          <div className="accent-bar" />
          <h1>Permisos</h1>
          <span className="users-count">
            {total} permisos · {roles.length} {roles.length === 1 ? 'rol' : 'roles'}
          </span>
        </div>
        {canWrite && (
          <Link to="/roles" className="btn btn-secondary">
            <PencilIcon />
            Editar en Roles
          </Link>
        )}
      </header>
      {isLoading && <Spinner />}
      {error && <ErrorMessage error={error} />}
      <div className="table-wrap">
        <table className="table matrix" aria-label="Matriz de roles y permisos">
          <thead>
            <tr>
              <th>Permiso</th>
              {roles.map((r) => (
                <th key={r.id} className="col-role">
                  <span className="th-inner">
                    {r.permissions.includes(WILDCARD) && <CrownIcon size={14} />}
                    {r.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.key}>
              <tr className="group-row">
                <td colSpan={roles.length + 1}>{g.label}</td>
              </tr>
              {g.perms.map((p) => (
                <tr key={p}>
                  <td>
                    <div className="stack-cell">
                      <span>{PERMISSION_LABELS[p]}</span>
                      <code className="perm-code">{p}</code>
                    </div>
                  </td>
                  {roles.map((r) => {
                    const has = r.permissions.includes(WILDCARD) || r.permissions.includes(p);
                    return (
                      <td key={r.id} className="cell">
                        {has ? (
                          <span className="mark mark-on" role="img" aria-label={`${r.name} tiene ${p}`}>
                            <CheckIcon size={13} />
                          </span>
                        ) : (
                          <span className="mark mark-off" role="img" aria-label={`${r.name} no tiene ${p}`}>
                            <MinusIcon size={13} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <div className="legend">
        <span>
          <span className="mark mark-on" aria-hidden="true">
            <CheckIcon size={11} />
          </span>
          Concedido
        </span>
        <span>
          <CrownIcon size={14} />
          Rol con todos los permisos
        </span>
      </div>
    </section>
  );
}
