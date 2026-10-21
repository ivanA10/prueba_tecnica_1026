import { fetchBaseQuery, type BaseQueryApi, type BaseQueryFn, type FetchArgs, type FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { config } from '@/config';
import { clearSession, setSession } from '@/store/session';
import type { TokenResponse } from './types';

interface State {
  session: { accessToken: string | null };
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: config.apiBaseUrl,
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as State).session.accessToken;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

let inflight: Promise<boolean> | null = null;

/** Un unico refresh compartido entre peticiones concurrentes. */
export function refreshSession(api: BaseQueryApi): Promise<boolean> {
  if (!inflight) {
    inflight = (async () => {
      const res = await rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, {});
      if (res.data) {
        api.dispatch(setSession({ accessToken: (res.data as TokenResponse).accessToken }));
        return true;
      }
      api.dispatch(clearSession());
      return false;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  let result = await rawBaseQuery(args, api, extra);
  const url = typeof args === 'string' ? args : args.url;
  if (result.error?.status === 401 && !url.startsWith('/auth/')) {
    if (await refreshSession(api)) result = await rawBaseQuery(args, api, extra);
  }
  return result;
};
