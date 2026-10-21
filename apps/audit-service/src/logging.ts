import type { LoggerService } from '@nestjs/common';
import type { createLogger } from '@toka/logger';

type Logger = ReturnType<typeof createLogger>;

export const LOGGER = 'LOGGER';

/** Routes NestJS framework/`new Logger()` output through pino so every line is JSON. */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  private emit(level: 'info' | 'warn' | 'error' | 'debug', message: unknown, params: unknown[]): void {
    const last = params[params.length - 1];
    const context = typeof last === 'string' ? last : undefined;
    const msg = typeof message === 'string' ? message : message instanceof Error ? message.message : JSON.stringify(message);
    this.logger[level]({ context }, msg);
  }

  log(message: unknown, ...params: unknown[]): void {
    this.emit('info', message, params);
  }
  error(message: unknown, ...params: unknown[]): void {
    this.emit('error', message, params.length > 1 ? [params[params.length - 1]] : []);
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.emit('warn', message, params);
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.emit('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.emit('debug', message, params);
  }
}
