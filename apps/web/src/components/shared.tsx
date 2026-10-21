import { useEffect, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { dismiss } from '@/store/notifications';

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p role="status" className="spinner">
      {label}
    </p>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <div className="page-title">
      <h1>{children}</h1>
    </div>
  );
}

export function errorText(error: unknown): string {
  const e = error as { status?: number | string; data?: { message?: string | string[] } } | undefined;
  const m = e?.data?.message;
  if (Array.isArray(m)) return m.join(', ');
  if (typeof m === 'string') return m;
  if (e?.status === 403) return 'No tienes permisos para esta acción (403).';
  if (e?.status === 429) return 'Demasiados intentos, espera un momento (429).';
  return 'Ha ocurrido un error. Inténtalo de nuevo.';
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
          <span>{n.message}</span>
          <button type="button" className="btn btn-ghost" aria-label="Cerrar" onClick={() => dispatch(dismiss(n.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog(props: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Confirmación">
        <div className="dialog-title">Confirmación</div>
        <p className="dialog-body">{props.message}</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={props.onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={props.onConfirm}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
