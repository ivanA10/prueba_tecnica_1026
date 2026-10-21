import { api } from './api';
import type { AuditEvent, Page } from './types';

export interface AuditFilters {
  type?: string;
  actor?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export const auditApi = api.injectEndpoints({
  endpoints: (b) => ({
    getAuditEvents: b.query<Page<AuditEvent>, AuditFilters>({
      query: (f) => {
        const p = new URLSearchParams();
        Object.entries(f).forEach(([k, v]) => {
          if (v !== undefined && v !== '') p.set(k, String(v));
        });
        return `/audit/events?${p.toString()}`;
      },
      providesTags: ['Audit'],
    }),
  }),
});
export const { useGetAuditEventsQuery } = auditApi;
