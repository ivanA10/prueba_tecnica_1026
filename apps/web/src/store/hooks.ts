import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { hasPermission } from '@toka/contracts';
import type { AppDispatch, RootState } from './index';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** Returns `value` after it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** True when the session JWT grants `perm` (wildcard '*' grants all). */
export function useCan(perm: string): boolean {
  const granted = useAppSelector((s) => s.session.user?.permissions);
  return hasPermission(granted, perm);
}
