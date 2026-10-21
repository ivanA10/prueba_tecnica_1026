import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface Notification {
  id: number;
  kind: 'success' | 'error';
  message: string;
}
let seq = 0;

const slice = createSlice({
  name: 'notifications',
  initialState: [] as Notification[],
  reducers: {
    notify: {
      reducer: (s, a: PayloadAction<Notification>) => {
        s.push(a.payload);
      },
      prepare: (kind: Notification['kind'], message: string) => ({ payload: { id: ++seq, kind, message } }),
    },
    dismiss: (s, a: PayloadAction<number>) => s.filter((n) => n.id !== a.payload),
  },
});

export const { notify, dismiss } = slice.actions;
export default slice.reducer;
