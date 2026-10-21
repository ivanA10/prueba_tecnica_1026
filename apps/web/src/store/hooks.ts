import { useDispatch, useSelector } from 'react-redux';
import { hasPermission } from '@toka/contracts';
import type { AppDispatch, RootState } from './index';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** True when the session JWT grants `perm` (wildcard '*' grants all). */
export function useCan(perm: string): boolean {
  const granted = useAppSelector((s) => s.session.user?.permissions);
  return hasPermission(granted, perm);
}
