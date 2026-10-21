import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadConfig } from '../config/config';
import { AnthropicProvider } from '../infrastructure/llm/anthropic.provider';
import { MockProvider } from '../infrastructure/llm/mock.provider';
import { evaluate } from './harness';

async function main(): Promise<void> {
  const useReal = process.env.EVAL_PROVIDER === 'anthropic' && !!process.env.ANTHROPIC_API_KEY;
  const llm = useReal
    ? new AnthropicProvider({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: loadConfig({ ...process.env, JWKS_URI: 'x', REDIS_URL: 'x', QDRANT_URL: 'x', USER_SERVICE_URL: 'x' }).llmModel,
      })
    : new MockProvider();
  const { report, summary } = await evaluate(llm);
  const out = resolve(process.env.EVAL_REPORT_PATH ?? resolve(__dirname, '../../../../docs/eval/report.md'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, report, 'utf8');
  console.log(`eval: ${summary.passed}/${summary.n} passed, provider=${summary.provider}, report=${out}`);
  if (summary.passed < summary.n) process.exitCode = 1;
}

void main();
