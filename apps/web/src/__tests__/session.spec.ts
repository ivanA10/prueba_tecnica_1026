import { makeStore } from '@/store';
import { clearSession, setSession } from '@/store/session';
import { usersApi } from '@/api/users';
import { decodeJwt } from '@/api/jwt';
import { bootstrapSession } from '@/api/auth';
import { adminToken, makeJwt, mockFetch } from '../../test/helpers';

const page = { items: [], page: 1, limit: 10, total: 0 };

describe('session and api client', () => {
  it('setSession decodes sub/roles and clearSession resets', () => {
    const store = makeStore();
    store.dispatch(setSession({ accessToken: adminToken }));
    expect(store.getState().session.user).toEqual({ id: 'u1', roles: ['admin'] });
    store.dispatch(clearSession());
    expect(store.getState().session).toMatchObject({ status: 'anonymous', accessToken: null });
    expect(decodeJwt('garbage')).toBeNull();
  });

  it('sends the Bearer token', async () => {
    const store = makeStore();
    store.dispatch(setSession({ accessToken: adminToken }));
    const fetchMock = mockFetch(() => ({ body: page }));
    await store.dispatch(usersApi.endpoints.getUsers.initiate({ page: 1, limit: 10 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(req.headers.get('Authorization')).toBe(`Bearer ${adminToken}`);
  });

  it('on 401 does a single shared refresh and retries', async () => {
    const store = makeStore();
    store.dispatch(setSession({ accessToken: 'old' }));
    const fresh = makeJwt({ sub: 'u1', roles: ['admin'], n: 2 });
    const calls: string[] = [];
    mockFetch(({ url, auth }) => {
      calls.push(url);
      if (url.startsWith('/auth/refresh')) return { body: { accessToken: fresh, expiresIn: 900 } };
      return auth === `Bearer ${fresh}` ? { body: page } : { status: 401, body: { message: 'expired' } };
    });
    const [a, b] = await Promise.all([
      store.dispatch(usersApi.endpoints.getUsers.initiate({ page: 1, limit: 10 })),
      store.dispatch(usersApi.endpoints.getUsers.initiate({ page: 2, limit: 10 })),
    ]);
    expect(a.data).toBeDefined();
    expect(b.data).toBeDefined();
    expect(calls.filter((c) => c.startsWith('/auth/refresh'))).toHaveLength(1);
    expect(store.getState().session.accessToken).toBe(fresh);
  });

  it('clears the session when refresh fails; bootstrap sets anonymous', async () => {
    const store = makeStore();
    store.dispatch(setSession({ accessToken: 'old' }));
    mockFetch(() => ({ status: 401, body: { message: 'no' } }));
    const res = await store.dispatch(usersApi.endpoints.getUsers.initiate({ page: 1, limit: 10 }));
    expect(res.error).toBeDefined();
    expect(store.getState().session.status).toBe('anonymous');

    const s2 = makeStore();
    await s2.dispatch(bootstrapSession());
    expect(s2.getState().session.status).toBe('anonymous');
  });
});
