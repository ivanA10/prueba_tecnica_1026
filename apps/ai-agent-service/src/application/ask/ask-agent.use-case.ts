import { PERMISSIONS, hasPermission } from '@toka/contracts';
import type { AgentMetricsRecorder } from '../ports/agent-metrics-recorder.port';
import type { EmbeddingProvider } from '../ports/embedding-provider.port';
import type { KnowledgeStore, SearchHit } from '../ports/knowledge-store.port';
import type { LlmMessage, LlmProvider, LlmTool, LlmUsage } from '../ports/llm-provider.port';
import type { UserDirectoryGateway } from '../ports/user-directory-gateway.port';
import { AgentResponse, REFUSAL_NO_CONTEXT, Source } from '../../domain/agent-answer';
import { PriceEnv, estimateCost } from '../../infrastructure/llm/cost';
import { SYSTEM_PROMPT, buildMessages, wrapToolResult } from './prompt-builder';
import { validateAgentOutput } from './validate-output';

export const LOOKUP_USERS_TOOL: LlmTool = {
  name: 'lookup_users',
  description: 'Read-only lookup of platform users (id, name, roleId, status). Use at most once.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional name fragment' },
      role: { type: 'string', description: 'Optional roleId filter' },
    },
  },
};

export interface AskSettings {
  ragTopK: number;
  ragMinScore: number;
  llmMaxTokens: number;
  llmTimeoutMs: number;
  agentDeadlineMs: number;
}

export interface AskDeps {
  embedder: EmbeddingProvider;
  store: KnowledgeStore;
  llm: LlmProvider;
  users: UserDirectoryGateway;
  metrics: AgentMetricsRecorder;
  logger?: { warn(obj: Record<string, unknown>, msg?: string): void };
  settings: AskSettings;
  priceEnv?: PriceEnv;
  now?: () => number;
}

export interface AskInput {
  question: string;
  roles: string[];
  permissions: string[];
  authorization: string;
  correlationId?: string;
}

export class AskAgentUseCase {
  private readonly now: () => number;

  constructor(private readonly deps: AskDeps) {
    this.now = deps.now ?? Date.now;
  }

  async ask(input: AskInput): Promise<AgentResponse> {
    const { settings: cfg } = this.deps;
    const start = this.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.agentDeadlineMs);
    const aborted = new Promise<never>((_, reject) =>
      ctrl.signal.addEventListener('abort', () => reject(new Error('deadline exceeded')), { once: true }),
    );
    aborted.catch(() => undefined);
    const guard = <T>(p: Promise<T>): Promise<T> => Promise.race([p, aborted]);

    const usage: LlmUsage = { tokensIn: 0, tokensOut: 0 };
    let toolCalls = 0;
    let hits: SearchHit[] = [];
    let response: AgentResponse;
    try {
      const [vector] = await guard(this.deps.embedder.embed([input.question]));
      const roleScopes = [...new Set([...input.roles, 'all'])];
      const found = await guard(this.deps.store.search(vector, { roleScopes, limit: cfg.ragTopK }));
      hits = found.filter((h) => h.score >= cfg.ragMinScore);

      const tools = hasPermission(input.permissions, PERMISSIONS.USERS_READ) ? [LOOKUP_USERS_TOOL] : undefined;
      let messages: LlmMessage[] = buildMessages(input.question, hits);
      const call = async (msgs: LlmMessage[], withTools: LlmTool[] | undefined) => {
        const remaining = cfg.agentDeadlineMs - (this.now() - start);
        const r = await guard(
          this.deps.llm.generate({
            system: SYSTEM_PROMPT,
            messages: msgs,
            tools: withTools,
            maxTokens: cfg.llmMaxTokens,
            timeoutMs: Math.max(1, Math.min(cfg.llmTimeoutMs, remaining)),
            signal: ctrl.signal,
          }),
        );
        usage.tokensIn += r.usage.tokensIn;
        usage.tokensOut += r.usage.tokensOut;
        return r;
      };

      let res = await call(messages, tools);
      if (res.toolCalls.length > 0 && tools) {
        const calls = res.toolCalls.filter((c) => c.name === LOOKUP_USERS_TOOL.name).slice(0, 2);
        const results: LlmMessage[] = [];
        for (const c of calls) {
          try {
            const users = await guard(
              this.deps.users.lookup(
                {
                  query: typeof c.input.query === 'string' ? c.input.query : undefined,
                  role: typeof c.input.role === 'string' ? c.input.role : undefined,
                },
                { authorization: input.authorization, correlationId: input.correlationId, signal: ctrl.signal },
              ),
            );
            toolCalls += 1;
            results.push({ role: 'tool', toolCallId: c.id, content: wrapToolResult(JSON.stringify(users)) });
          } catch (err) {
            if (ctrl.signal.aborted) throw err;
            // tool unavailable (e.g. 403 for callers without users:read): continue without it
          }
        }
        if (results.length > 0) {
          messages = [...messages, { role: 'assistant', content: res.text, toolCalls: calls }, ...results];
          res = await call(messages, tools);
        } else {
          res = await call(messages, undefined);
        }
      }

      const validated = validateAgentOutput(
        res.text,
        hits.map((h) => h.docId),
      );
      if (!validated) throw new Error('invalid LLM output');
      const { answer } = validated;
      const refused = answer.refused === true;
      response = {
        answer: answer.answer,
        degraded: false,
        sources: refused ? [] : this.toSources(answer.sources.map((s) => s.docId), hits),
        ...(refused ? { refused: true, refusalCode: answer.refusalCode ?? REFUSAL_NO_CONTEXT } : {}),
        meta: this.meta(start, usage, hits.length, toolCalls),
      };
    } catch (err) {
      this.deps.logger?.warn({ event: 'agent.degraded', error: (err as Error).message }, 'agent degraded');
      response = {
        answer: this.degradedAnswer(hits),
        degraded: true,
        sources: this.toSources([], hits),
        meta: this.meta(start, usage, hits.length, toolCalls),
      };
    } finally {
      clearTimeout(timer);
    }
    this.deps.metrics.record({
      provider: response.meta.provider,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costUsd: response.meta.costUsd,
      latencyMs: response.meta.latencyMs,
      ragHits: hits.length,
      degraded: response.degraded,
      toolCalls,
    });
    return response;
  }

  private meta(start: number, usage: LlmUsage, ragHits: number, toolCalls: number) {
    return {
      latencyMs: this.now() - start,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costUsd: estimateCost(usage, this.deps.priceEnv ?? process.env),
      provider: this.deps.llm.name,
      ragHits,
      toolCalls,
    };
  }

  private toSources(docIds: string[], hits: SearchHit[]): Source[] {
    const wanted = docIds.length ? docIds : hits.map((h) => h.docId);
    const out: Source[] = [];
    for (const docId of new Set(wanted)) {
      const best = hits.filter((h) => h.docId === docId).sort((a, b) => b.score - a.score)[0];
      if (best) out.push({ docId, source: best.source, score: Number(best.score.toFixed(4)) });
    }
    return out;
  }

  private degradedAnswer(hits: SearchHit[]): string {
    if (hits.length === 0) {
      return 'No fue posible generar una respuesta en este momento y no se encontraron fragmentos relevantes.';
    }
    const frags = hits.slice(0, 3).map((h) => `- ${h.text.slice(0, 400)}`);
    return `El modelo no esta disponible. Fragmentos relevantes de la base de conocimiento:\n${frags.join('\n')}`;
  }
}
