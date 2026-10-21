import type { LlmProvider, LlmRequest, LlmResponse } from '../../application/ports/llm-provider.port';
import { REFUSAL_NO_CONTEXT } from '../../domain/agent-answer';

const FRAGMENT_RE = /<fragment docId="([^"]*)"[^>]*>([\s\S]*?)<\/fragment>/g;

function words(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function firstSentences(text: string, n: number): string {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) ?? [];
  return parts.slice(0, n).join(' ').trim();
}

/**
 * Deterministic provider used when ANTHROPIC_API_KEY is empty. It builds a JSON answer solely
 * from the retrieved fragments found in the prompt; it never invents content.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock';

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const tokensIn = words(req.system) + req.messages.reduce((a, m) => a + words(m.content), 0);
    const firstUser = req.messages.find((m) => m.role === 'user');
    const prompt = firstUser?.content ?? '';
    const toolResult = req.messages.find((m) => m.role === 'tool');

    if (!toolResult && req.tools?.some((t) => t.name === 'lookup_users')) {
      const question = /<user_question>([\s\S]*?)<\/user_question>/.exec(prompt)?.[1] ?? prompt;
      if (/usuari|user/i.test(question)) {
        return {
          text: '',
          toolCalls: [{ id: 'mock-tool-1', name: 'lookup_users', input: {} }],
          usage: { tokensIn, tokensOut: 5 },
          provider: this.name,
        };
      }
    }

    const fragments = [...prompt.matchAll(FRAGMENT_RE)].map((m) => ({ docId: m[1], text: m[2] }));
    let payload: Record<string, unknown>;
    if (fragments.length === 0 && toolResult) {
      payload = { answer: `Resultado del directorio de usuarios: ${toolResult.content.slice(0, 300)}`, sources: [] };
    } else if (fragments.length === 0) {
      payload = {
        answer: 'No tengo informacion suficiente en la base de conocimiento para responder a esa pregunta.',
        sources: [],
        refused: true,
        refusalCode: REFUSAL_NO_CONTEXT,
      };
    } else {
      const used = fragments.slice(0, 2);
      let answer = used.map((f) => firstSentences(f.text, 2)).join(' ');
      if (toolResult) answer += ` Resultado del directorio de usuarios: ${toolResult.content.slice(0, 200)}`;
      payload = { answer, sources: [...new Set(used.map((f) => f.docId))].map((docId) => ({ docId })) };
    }
    const text = JSON.stringify(payload);
    return { text, toolCalls: [], usage: { tokensIn, tokensOut: words(text) }, provider: this.name };
  }
}
