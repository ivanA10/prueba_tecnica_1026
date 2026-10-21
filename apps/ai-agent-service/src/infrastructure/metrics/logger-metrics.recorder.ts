import type { AgentMetrics, AgentMetricsRecorder } from '../../application/ports/agent-metrics-recorder.port';

export interface InfoLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
}

/** Logs per-request metrics; never logs prompts or answers. */
export class LoggerMetricsRecorder implements AgentMetricsRecorder {
  constructor(private readonly logger: InfoLogger) {}

  record(m: AgentMetrics): void {
    this.logger.info(
      {
        event: 'agent.ask',
        'llm.provider': m.provider,
        'llm.tokensIn': m.tokensIn,
        'llm.tokensOut': m.tokensOut,
        'llm.costEstimate': m.costUsd,
        latencyMs: m.latencyMs,
        ragHits: m.ragHits,
        degraded: m.degraded,
        toolCalls: m.toolCalls,
      },
      'agent request metrics',
    );
  }
}
