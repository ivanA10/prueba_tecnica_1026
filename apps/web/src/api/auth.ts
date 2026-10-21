import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from './api';
import { refreshSession } from './baseQuery';
import type { TokenResponse } from './types';

export const authApi = api.injectEndpoints({
  endpoints: (b) => ({
    login: b.mutation<TokenResponse, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    logout: b.mutation<void, void>({ query: () => ({ url: '/auth/logout', method: 'POST' }) }),
  }),
});

export const { useLoginMutation, useLogoutMutation } = authApi;

/** Refresh inicial: fija la sesion a authenticated o anonymous (via refreshSession). */
export const bootstrapSession = createAsyncThunk('session/bootstrap', async (_: void, thunkApi) => {
  await refreshSession(thunkApi as never);
});
