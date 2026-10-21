import { api } from './api';
import type { AgentAnswer } from './types';

export const agentApi = api.injectEndpoints({
  endpoints: (b) => ({
    ask: b.mutation<AgentAnswer, { question: string }>({
      query: (body) => ({ url: '/agent/ask', method: 'POST', body }),
    }),
  }),
});
export const { useAskMutation } = agentApi;
