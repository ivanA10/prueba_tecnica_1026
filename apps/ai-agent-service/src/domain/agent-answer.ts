/** Structured answer the LLM must return (JSON) and the HTTP response types. */
export interface AgentAnswerSource {
  docId: string;
}

export interface AgentAnswer {
  answer: string;
  sources: AgentAnswerSource[];
  refused?: boolean;
  refusalCode?: string;
}

export interface Source {
  docId: string;
  source: string;
  score: number;
}

export interface AgentMeta {
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  provider: string;
  ragHits: number;
  toolCalls: number;
}

export interface AgentResponse {
  answer: string;
  degraded: boolean;
  sources: Source[];
  refused?: boolean;
  refusalCode?: string;
  meta: AgentMeta;
}

export const MAX_ANSWER_CHARS = 4000;
export const REFUSAL_NO_CONTEXT = 'NO_CONTEXT';

/** Returns a typed AgentAnswer or null when the value does not satisfy the schema. */
export function parseAgentAnswer(value: unknown): AgentAnswer | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.answer !== 'string' || !v.answer.trim() || v.answer.length > MAX_ANSWER_CHARS) return null;
  if (!Array.isArray(v.sources)) return null;
  const sources: AgentAnswerSource[] = [];
  for (const s of v.sources) {
    if (typeof s !== 'object' || s === null || typeof (s as { docId?: unknown }).docId !== 'string') return null;
    sources.push({ docId: (s as { docId: string }).docId });
  }
  if (v.refused !== undefined && typeof v.refused !== 'boolean') return null;
  if (v.refusalCode !== undefined && typeof v.refusalCode !== 'string') return null;
  const out: AgentAnswer = { answer: v.answer.trim(), sources };
  if (v.refused !== undefined) out.refused = v.refused;
  if (v.refusalCode !== undefined) out.refusalCode = v.refusalCode;
  return out;
}
