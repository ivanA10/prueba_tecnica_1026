import type { LlmUsage } from '../../application/ports/llm-provider.port';

export interface PriceEnv {
  LLM_PRICE_INPUT_PER_MTOK?: string;
  LLM_PRICE_OUTPUT_PER_MTOK?: string;
}

function price(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Cost in USD from env-provided prices per million tokens; null when either price is unset/invalid. */
export function estimateCost(usage: LlmUsage, env: PriceEnv = process.env): number | null {
  const pin = price(env.LLM_PRICE_INPUT_PER_MTOK);
  const pout = price(env.LLM_PRICE_OUTPUT_PER_MTOK);
  if (pin === null || pout === null) return null;
  return (usage.tokensIn / 1e6) * pin + (usage.tokensOut / 1e6) * pout;
}
