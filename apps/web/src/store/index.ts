import { configureStore } from '@reduxjs/toolkit';
import { api } from '@/api/api';
import session from './session';
import notifications from './notifications';

export function makeStore() {
  return configureStore({
    reducer: { session, notifications, [api.reducerPath]: api.reducer },
    middleware: (gdm) => gdm().concat(api.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
