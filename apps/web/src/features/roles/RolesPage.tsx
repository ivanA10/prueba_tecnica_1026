import { useGetRolesQuery } from '@/api/roles';
import { ErrorMessage, Spinner } from '@/components/shared';

export function RolesPage() {
  const { data, isLoading, error } = useGetRolesQuery();
  return (
    <section>
      <h1>Roles</h1>
      {isLoading && <Spinner />}
      {error && <ErrorMessage error={error} />}
      {Array.isArray(data) && (
        <ul>
          {data.map((r) => (
            <li key={r.id}>
              <strong>{r.name}</strong>: {r.permissions.join(', ') || 'sin permisos'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
