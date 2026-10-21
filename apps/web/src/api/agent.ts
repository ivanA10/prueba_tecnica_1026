import { api } from './api';
import type { AgentAnswer } from './types';

export const agentApi = api.injectEndpoints({
  endpoints: (b) => ({
    ingest: b.mutation<{ docId: string; chunks: number }, { docId: string; source: string; roleScope: string[]; text: string }>({
      query: (body) => ({ url: '/agent/ingest', method: 'POST', body }),
    }),
    ask: b.mutation<AgentAnswer, { question: string }>({
      query: (body) => ({ url: '/agent/ask', method: 'POST', body }),
    }),
  }),
});
export const { useAskMutation, useIngestMutation } = agentApi;
