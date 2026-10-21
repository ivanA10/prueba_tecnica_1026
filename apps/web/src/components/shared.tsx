import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { dismiss } from '@/store/notifications';

export function Spinner({ label = 'Cargando...' }: { label?: string }) {
  return <p role="status">{label}</p>;
}

export function errorText(error: unknown): string {
  const e = error as { status?: number | string; data?: { message?: string | string[] } } | undefined;
  const m = e?.data?.message;
  if (Array.isArray(m)) return m.join(', ');
  if (typeof m === 'string') return m;
  if (e?.status === 403) return 'No tienes permisos para esta accion (403).';
  if (e?.status === 429) return 'Demasiados intentos, espera un momento (429).';
  return 'Ha ocurrido un error. Intentalo de nuevo.';
}

export function ErrorMessage({ error }: { error: unknown }) {
  return (
    <p role="alert" className="error">
      {errorText(error)}
    </p>
  );
}

export function Toaster() {
  const items = useAppSelector((s) => s.notifications);
  const dispatch = useAppDispatch();
  useEffect(() => {
    const timers = items.map((n) => setTimeout(() => dispatch(dismiss(n.id)), 5000));
    return () => timers.forEach(clearTimeout);
  }, [items, dispatch]);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((n) => (
        <div key={n.id} className={`toast ${n.kind}`} role={n.kind === 'error' ? 'alert' : 'status'}>
          {n.message}{' '}
          <button type="button" aria-label="Cerrar" onClick={() => dispatch(dismiss(n.id))}>
            x
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog(props: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="dialog">
      <div role="dialog" aria-modal="true" aria-label="Confirmacion">
        <p>{props.message}</p>
        <button type="button" onClick={props.onConfirm}>
          Confirmar
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
