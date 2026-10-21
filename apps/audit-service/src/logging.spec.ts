import { createEnvelope } from '@toka/contracts';
import { createLogger } from '@toka/logger';
import { AuditProcessor, AuditRepository } from './audit.processor';

describe('AuditProcessor structured logs', () => {
  it('logs audit.inserted, audit.duplicate and audit.insert_failed with eventId and correlationId', async () => {
    const lines: Record<string, unknown>[] = [];
    const logger = createLogger({ service: 'audit-service', destination: { write: (s: string) => void lines.push(JSON.parse(s)) } });
    const repo: jest.Mocked<AuditRepository> = {
      insert: jest.fn().mockResolvedValueOnce('inserted').mockResolvedValueOnce('duplicate').mockRejectedValueOnce(new Error('mongo down')),
      query: jest.fn(),
    };
    const proc = new AuditProcessor(repo, { maxRetries: 3 }, logger);
    const env = createEnvelope({
      type: 'user.created',
      aggregateVersion: 1,
      correlationId: 'cid-9',
      actor: 'system',
      payload: { userId: 'u1' },
    });
    for (let i = 0; i < 3; i++) await proc.process(Buffer.from(JSON.stringify(env)), 0);
    expect(lines.map((l) => l.event)).toEqual(['audit.inserted', 'audit.duplicate', 'audit.insert_failed']);
    expect(lines[0]).toMatchObject({ service: 'audit-service', eventId: env.eventId, type: 'user.created', correlationId: 'cid-9' });
    expect(JSON.stringify(lines)).not.toContain('payload');
  });
});
