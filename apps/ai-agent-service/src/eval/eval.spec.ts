import { EVAL_DATASET } from './dataset';
import { evaluate } from './harness';
import { percentile } from './runner';

describe('eval harness (keyless)', () => {
  it('runs the dataset with mock + in-memory store and renders a report', async () => {
    expect(EVAL_DATASET.length).toBeGreaterThanOrEqual(10);
    const { summary, report } = await evaluate(undefined, {});
    expect(summary.passed).toBe(summary.n);
    expect(summary.costUsd).toBeNull();
    expect(report).toContain('Cost (USD) | n/d');
    expect(report).toContain('Latency p95');
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });
});
