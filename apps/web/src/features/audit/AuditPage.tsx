import { useState } from 'react';
import { useGetAuditEventsQuery } from '@/api/audit';
import { ErrorMessage, Spinner } from '@/components/shared';

export function AuditPage() {
  const [type, setType] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const { data, isFetching, error } = useGetAuditEventsQuery({ type, actor, from, to, page, limit });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <section>
      <h1>Auditoria</h1>
      <div>
        <label>
          Tipo
          <input value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} />
        </label>
        <label>
          Actor
          <input value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} />
        </label>
        <label>
          Desde
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </label>
        <label>
          Hasta
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </label>
      </div>
      {isFetching && <Spinner />}
      {error && <ErrorMessage error={error} />}
      {data && data.items.length === 0 && <p>Sin eventos.</p>}
      {data && data.items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Actor</th>
              <th>Fecha</th>
              <th>Correlacion</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((e) => (
              <tr key={e.eventId}>
                <td>{e.type}</td>
                <td>{e.actorUserId}</td>
                <td>{e.occurredAt}</td>
                <td>{e.correlationId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Anterior
      </button>
      <span>
        Pagina {page} de {pages}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>
        Siguiente
      </button>
    </section>
  );
}
