/**
 * Anthropic adapter for the LlmProvider port.
 *
 * Verified 2026-10-20 against @anthropic-ai/sdk 0.60.0 (installed type definitions; the harness SDK
 * skill was not invocable in this session): `new Anthropic({ apiKey, maxRetries, timeout })`,
 * `client.messages.create(body, { signal, timeout })`, `system` as text blocks with
 * `cache_control: { type: 'ephemeral' }`, tool use via `tools[].input_schema` + `tool_use` /
 * `tool_result` blocks, usage fields `input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
 * `cache_read_input_tokens`. The model identifier comes only from configuration (LLM_MODEL).
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmToolCall,
  LlmUnavailableError,
} from '../../application/ports/llm-provider.port';

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export interface AnthropicClientLike {
  messages: {
    create(
      body: Record<string, unknown>,
      options?: { signal?: AbortSignal; timeout?: number },
    ): Promise<{
      content: AnthropicBlock[];
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number | null;
        cache_read_input_tokens?: number | null;
      };
    }>;
  };
}

export interface AnthropicProviderOptions {
  apiKey?: string;
  model: string;
  client?: AnthropicClientLike;
}

type ApiMessage = { role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> };

export function toApiMessages(messages: LlmMessage[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      const blocks: Array<Record<string, unknown>> = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
      out.push({ role: 'assistant', content: blocks });
    } else {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) last.content.push(block);
      else out.push({ role: 'user', content: [block] });
    }
  }
  return out;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly client: AnthropicClientLike;
  private readonly model: string;

  constructor(opts: AnthropicProviderOptions) {
    if (!opts.model) throw new Error('LLM_MODEL is required for the Anthropic provider');
    this.model = opts.model;
    this.client =
      opts.client ??
      (new Anthropic({
        apiKey: opts.apiKey,
        maxRetries: 1, // explicit: at most one retry; the per-request signal bounds the total budget
        timeout: 20000,
      }) as unknown as AnthropicClientLike);
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.maxTokens,
      // Stable prefix (system prompt + few-shot) is cached across requests.
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: toApiMessages(req.messages),
    };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    }
    try {
      const res = await this.client.messages.create(body, { signal: req.signal, timeout: req.timeoutMs });
      const text = res.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
      const toolCalls: LlmToolCall[] = res.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id ?? '', name: b.name ?? '', input: (b.input ?? {}) as Record<string, unknown> }));
      const u = res.usage;
      return {
        text,
        toolCalls,
        usage: {
          tokensIn: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
          tokensOut: u.output_tokens,
        },
        provider: this.name,
      };
    } catch (err) {
      const status = (err as { status?: number }).status;
      throw new LlmUnavailableError(`Anthropic request failed: ${(err as Error).message}`, status, { cause: err });
    }
  }
}
