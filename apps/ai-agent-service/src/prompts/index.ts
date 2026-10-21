import type { LlmMessage } from '../application/ports/llm-provider.port';
import type { SearchHit } from '../application/ports/knowledge-store.port';

export { PROMPT_VERSION, SYSTEM_PROMPT, FEW_SHOT } from './system-prompt';

function escapeAttr(s: string): string {
  return s.replace(/"/g, "'");
}

/** Strips delimiter look-alikes so untrusted text cannot close our blocks. */
export function neutralize(text: string): string {
  return text.replace(/<\/?\s*(context|fragment|user_question|tool_result)[^>]*>/gi, '');
}

export function buildUserPrompt(question: string, fragments: SearchHit[]): string {
  const ctx = fragments
    .map((f) => `<fragment docId="${escapeAttr(f.docId)}" source="${escapeAttr(f.source)}">${neutralize(f.text)}</fragment>`)
    .join('\n');
  return `<context>\n${ctx}\n</context>\n<user_question>${neutralize(question)}</user_question>`;
}

export function buildMessages(question: string, fragments: SearchHit[]): LlmMessage[] {
  return [{ role: 'user', content: buildUserPrompt(question, fragments) }];
}

export function wrapToolResult(json: string): string {
  return `<tool_result>${neutralize(json)}</tool_result>`;
}
