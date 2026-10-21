export interface LlmTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type LlmMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface LlmUsage {
  tokensIn: number;
  tokensOut: number;
}

export interface LlmResponse {
  text: string;
  toolCalls: LlmToolCall[];
  usage: LlmUsage;
  provider: string;
}

export interface LlmProvider {
  readonly name: string;
  generate(req: LlmRequest): Promise<LlmResponse>;
}

export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'LlmUnavailableError';
  }
}
