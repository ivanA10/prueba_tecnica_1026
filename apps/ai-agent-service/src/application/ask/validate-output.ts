import { AgentAnswer, parseAgentAnswer } from '../../domain/agent-answer';

export interface ValidatedOutput {
  answer: AgentAnswer;
  /** true when the text was not valid JSON and the fallback was used */
  fallback: boolean;
}

function stripFences(text: string): string {
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  return m ? m[1] : text.trim();
}

/**
 * Parses and validates the LLM output. Non-JSON text becomes the answer (fallback) citing the
 * retrieved docIds; unknown docIds are dropped; empty output returns null (degrade).
 */
export function validateAgentOutput(text: string, retrievedDocIds: string[]): ValidatedOutput | null {
  const known = new Set(retrievedDocIds);
  let parsed: AgentAnswer | null = null;
  try {
    parsed = parseAgentAnswer(JSON.parse(stripFences(text)));
  } catch {
    parsed = null;
  }
  if (parsed) {
    return { answer: { ...parsed, sources: parsed.sources.filter((s) => known.has(s.docId)) }, fallback: false };
  }
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('{')) return null; // empty or malformed JSON: do not leak raw payload
  return {
    answer: { answer: trimmed.slice(0, 4000), sources: [...known].map((docId) => ({ docId })) },
    fallback: true,
  };
}
