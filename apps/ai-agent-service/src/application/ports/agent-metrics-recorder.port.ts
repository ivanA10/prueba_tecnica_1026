export interface AgentMetrics {
  provider: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  latencyMs: number;
  ragHits: number;
  degraded: boolean;
  toolCalls: number;
}

export interface AgentMetricsRecorder {
  record(m: AgentMetrics): void;
}
