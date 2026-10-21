import pino, { DestinationStream, Logger } from 'pino';
import { getCorrelationId } from './correlation';

export interface CreateLoggerOptions {
  service: string;
  level?: string;
  destination?: DestinationStream;
}

export const REDACT_PATHS = [
  'password',
  '*.password',
  'refreshToken',
  '*.refreshToken',
  'authorization',
  '*.authorization',
  'headers.authorization',
  '*.token',
  'token',
];

export function createLogger(opts: CreateLoggerOptions): Logger {
  const options: pino.LoggerOptions = {
    level: opts.level ?? process.env.LOG_LEVEL ?? 'info',
    base: { service: opts.service },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: { level: (label) => ({ level: label }) },
    mixin: () => {
      const correlationId = getCorrelationId();
      return correlationId ? { correlationId } : {};
    },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };
  return opts.destination ? pino(options, opts.destination) : pino(options);
}
