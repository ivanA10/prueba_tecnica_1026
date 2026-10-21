import { useEffect, useMemo } from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { bootstrapSession } from '@/api/auth';
import { Toaster } from '@/components/shared';
import { AppRoutes } from '@/routes';
import { makeStore } from '@/store';

export function App() {
  const store = useMemo(() => makeStore(), []);
  useEffect(() => {
    void store.dispatch(bootstrapSession());
  }, [store]);
  return (
    <Provider store={store}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster />
      </BrowserRouter>
    </Provider>
  );
}
