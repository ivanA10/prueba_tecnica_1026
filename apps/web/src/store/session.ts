import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { decodeJwt, type SessionUser } from '@/api/jwt';

export interface SessionState {
  status: 'unknown' | 'authenticated' | 'anonymous';
  accessToken: string | null;
  user: SessionUser | null;
}

const initialState: SessionState = { status: 'unknown', accessToken: null, user: null };

const slice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setSession: {
      reducer(_s, a: PayloadAction<{ accessToken: string; user: SessionUser | null }>): SessionState {
        return { status: 'authenticated', accessToken: a.payload.accessToken, user: a.payload.user };
      },
      prepare: (p: { accessToken: string }) => ({
        payload: { accessToken: p.accessToken, user: decodeJwt(p.accessToken) },
      }),
    },
    clearSession: (): SessionState => ({ status: 'anonymous', accessToken: null, user: null }),
  },
});

export const { setSession, clearSession } = slice.actions;
export default slice.reducer;
