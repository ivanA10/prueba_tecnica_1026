import type { AgentConfig } from '../../config/config';
import type { LlmProvider } from '../../application/ports/llm-provider.port';
import { AnthropicProvider } from './anthropic.provider';
import { MockProvider } from './mock.provider';
import { ResilientLlmProvider } from './resilient.provider';

/** ANTHROPIC_API_KEY present -> Anthropic adapter; empty -> deterministic mock. */
export function createLlmProvider(cfg: AgentConfig): LlmProvider {
  const inner: LlmProvider = cfg.anthropicApiKey
    ? new AnthropicProvider({ apiKey: cfg.anthropicApiKey, model: cfg.llmModel })
    : new MockProvider();
  return new ResilientLlmProvider(inner, {
    maxConcurrency: cfg.llmMaxConcurrency,
    breakerThreshold: cfg.llmBreakerThreshold,
    breakerResetMs: cfg.llmBreakerResetMs,
  });
}
