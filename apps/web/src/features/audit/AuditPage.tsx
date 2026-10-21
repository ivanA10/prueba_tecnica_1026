import { useState } from 'react';
import { useGetAuditEventsQuery } from '@/api/audit';
import {
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  CircleIcon,
  CloseIcon,
  CopyIcon,
  GearIcon,
  SignInIcon,
  UserIcon,
  UserPlusIcon,
  WarningIcon,
} from '@/components/icons';
import { ErrorMessage, Spinner } from '@/components/shared';

const EVENT_ICONS: Record<string, typeof CircleIcon> = {
  'auth.login.succeeded': SignInIcon,
  'auth.login.failed': WarningIcon,
  'user.created': UserPlusIcon,
};
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Splits an ISO timestamp into time + readable date; falls back to the raw value. */
export function splitDate(iso: string): { time: string; date: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/.exec(iso);
  if (!m) return { time: iso, date: '' };
  return { time: m[4], date: `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]} · UTC` };
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon btn-icon-xs"
      title="Copiar"
      aria-label="Copiar correlación"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </button>
  );
}

export function AuditPage() {
  const [type, setType] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const { data, isFetching, error } = useGetAuditEventsQuery({ type, actor, from, to, page, limit });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const hasFilters = !!(type || actor || from || to);
  const filter = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    setPage(1);
  };
  return (
    <section className="page">
      <header className="page-header">
        <div className="users-heading">
          <div className="accent-bar" />
          <h1>Auditoría</h1>
          <span className="users-count">{data ? `${data.total} ${data.total === 1 ? 'evento' : 'eventos'}` : 'Eventos'}</span>
        </div>
      </header>
      <div className="filters">
        <div className="field">
          <label htmlFor="f-type">Tipo</label>
          <input className="input" id="f-type" placeholder="user.created" value={type} onChange={filter(setType)} />
        </div>
        <div className="field">
          <label htmlFor="f-actor">Actor</label>
          <input className="input" id="f-actor" placeholder="ID o system" value={actor} onChange={filter(setActor)} />
        </div>
        <div className="field">
          <label htmlFor="f-from">Desde</label>
          <input className="input" id="f-from" type="date" value={from} onChange={filter(setFrom)} />
        </div>
        <div className="field">
          <label htmlFor="f-to">Hasta</label>
          <input className="input" id="f-to" type="date" value={to} onChange={filter(setTo)} />
        </div>
        {hasFilters && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ justifySelf: 'start', whiteSpace: 'nowrap' }}
            onClick={() => {
              setType('');
              setActor('');
              setFrom('');
              setTo('');
              setPage(1);
            }}
          >
            <CloseIcon />
            Limpiar filtros
          </button>
        )}
      </div>
      {isFetching && <Spinner />}
      {error && <ErrorMessage error={error} />}
      {data && data.items.length === 0 && <p className="users-empty">Ningún evento coincide con los filtros.</p>}
      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ width: 220 }}>Evento</th>
                <th>Actor</th>
                <th style={{ width: 170 }}>Fecha</th>
                <th style={{ width: 170 }}>Correlación</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => {
                const Icon = EVENT_ICONS[e.type] ?? CircleIcon;
                const sys = e.actorUserId === 'system';
                const when = splitDate(e.occurredAt);
                const corr = e.correlationId ?? '';
                const short = corr.replace(/-/g, '').slice(0, 8);
                return (
                  <tr key={e.eventId}>
                    <td>
                      <span className={`tag mono ${e.type.endsWith('.failed') ? 'tag-outline' : 'tag-accent'}`}>
                        <Icon />
                        {e.type}
                      </span>
                    </td>
                    <td>
                      <span className={`actor mono${sys ? ' actor-system' : ''}`} title={e.actorUserId}>
                        {sys ? <GearIcon size={14} /> : <UserIcon size={14} />}
                        {sys || e.actorUserId.length <= 8 ? e.actorUserId : `${e.actorUserId.slice(0, 8)}…`}
                      </span>
                    </td>
                    <td>
                      <div className="stack-cell">
                        <span>{when.time}</span>
                        {when.date && <span className="sub">{when.date}</span>}
                      </div>
                    </td>
                    <td>
                      <div className="corr">
                        <code title={corr}>{short ? `${short}…` : ''}</code>
                        {corr && <CopyButton value={corr} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <footer className="pager">
        <span className="pager-info">
          Página {page} de {pages}
        </span>
        <button type="button" className="btn btn-secondary btn-icon btn-icon-sm" aria-label="Anterior" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <CaretLeftIcon />
        </button>
        <button type="button" className="btn btn-secondary btn-icon btn-icon-sm" aria-label="Siguiente" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          <CaretRightIcon />
        </button>
      </footer>
    </section>
  );
}
