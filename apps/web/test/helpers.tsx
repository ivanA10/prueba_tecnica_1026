import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { makeStore } from '@/store';
import { setSession } from '@/store/session';

export function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

export const adminToken = makeJwt({ sub: 'u1', roles: ['admin'], permissions: ['*'] });
export const userToken = makeJwt({ sub: 'u2', roles: ['user'], permissions: [] });

export type Handler = (req: { url: string; method: string; body: string; auth: string | null }) => { status?: number; body?: unknown } | undefined;

export function mockFetch(handler: Handler) {
  const fn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input as string, init);
    const body = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();
    const url = req.url.replace('http://localhost/api', '');
    const r = handler({ url, method: req.method, body, auth: req.headers.get("Authorization") }) ?? { status: 404, body: { message: 'not found' } };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

export function renderApp(ui: ReactElement, opts: { admin?: boolean; route?: string; token?: string | null } = {}) {
  const store = makeStore();
  if (opts.token !== null) store.dispatch(setSession({ accessToken: opts.token ?? (opts.admin === false ? userToken : adminToken) }));
  const utils = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[opts.route ?? '/']}>{ui}</MemoryRouter>
    </Provider>,
  );
  return { store, ...utils };
}
