import { Inject, Injectable } from '@nestjs/common';
import { EventEnvelope, RoutingKeys, isEventEnvelope } from '@toka/contracts';
import { PermanentError } from '../domain/errors';
import { CredentialRepository, ProjectionRepository, TOKENS } from './ports';
import { AuthService } from './token-service';

type Payload = Record<string, unknown>;

const str = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || !v) throw new PermanentError(`missing field ${field}`);
  return v;
};

@Injectable()
export class ProjectionHandler {
  constructor(
    @Inject(TOKENS.Credentials) private readonly credentials: CredentialRepository,
    @Inject(TOKENS.Projection) private readonly projection: ProjectionRepository,
    private readonly auth: AuthService,
  ) {}

  /** Idempotent: events already processed are skipped; stale versions are ignored. */
  async handle(raw: unknown): Promise<void> {
    if (!isEventEnvelope(raw)) throw new PermanentError('invalid envelope');
    const env = raw as EventEnvelope<Payload>;
    if (await this.projection.isProcessed(env.eventId)) return;
    const p = (env.payload ?? {}) as Payload;

    switch (env.type) {
      case RoutingKeys.UserCreated:
        await this.onUserCreated(env, p);
        break;
      case RoutingKeys.UserUpdated:
        await this.onUserUpdated(env, p);
        break;
      case RoutingKeys.UserDeleted:
        await this.onUserDeleted(p);
        break;
      case RoutingKeys.UserRoleAssigned:
        await this.onRoleAssigned(env, p);
        break;
      case RoutingKeys.RoleUpdated:
        await this.projection.getRoleName(str(p.roleId, 'roleId')).then(async (cur) => {
          if (!cur || env.aggregateVersion > cur.lastVersion) {
            await this.projection.saveRoleName(str(p.roleId, 'roleId'), str(p.name, 'name'), env.aggregateVersion);
          }
        });
        break;
      default:
        throw new PermanentError(`unknown event type ${env.type}`);
    }
    await this.projection.markProcessed(env.eventId);
  }

  private async onUserCreated(env: EventEnvelope<Payload>, p: Payload): Promise<void> {
    const userId = str(p.userId, 'userId');
    const cred = await this.credentials.findByUserId(userId);
    if (!cred) throw new Error(`credentials for ${userId} not found yet`); // transient: retry
    if (cred.status === 'PENDING') await this.credentials.setStatus(userId, 'ACTIVE');
    const ur = await this.projection.getUserRole(userId);
    const roleId = typeof p.roleId === 'string' && p.roleId ? p.roleId : ur?.roleId;
    if (roleId) {
      await this.projection.saveUserRole(userId, roleId, Math.max(ur?.lastVersion ?? 0, env.aggregateVersion));
    }
  }

  private async onUserUpdated(env: EventEnvelope<Payload>, p: Payload): Promise<void> {
    const userId = str(p.userId, 'userId');
    const ur = await this.projection.getUserRole(userId);
    if (ur && env.aggregateVersion <= ur.lastVersion) return;
    if (p.status === 'DISABLED') {
      await this.credentials.setStatus(userId, 'DISABLED');
      await this.auth.revokeUserSessions(userId);
    } else if (p.status === 'ACTIVE') {
      const cred = await this.credentials.findByUserId(userId);
      if (cred && cred.status === 'DISABLED') await this.credentials.setStatus(userId, 'ACTIVE');
    }
    if (typeof p.roleId === 'string' && p.roleId) {
      await this.projection.saveUserRole(userId, p.roleId, env.aggregateVersion);
    } else if (ur) {
      await this.projection.setUserVersion(userId, env.aggregateVersion);
    }
  }

  private async onUserDeleted(p: Payload): Promise<void> {
    const userId = str(p.userId, 'userId');
    await this.auth.revokeUserSessions(userId);
    await this.credentials.delete(userId);
    await this.projection.deleteUser(userId);
  }

  private async onRoleAssigned(env: EventEnvelope<Payload>, p: Payload): Promise<void> {
    const userId = str(p.userId, 'userId');
    const roleId = str(p.roleId, 'roleId');
    const roleName = str(p.roleName, 'roleName');
    const roleVersion = typeof p.roleVersion === 'number' ? p.roleVersion : 0;
    const ur = await this.projection.getUserRole(userId);
    if (!ur || env.aggregateVersion > ur.lastVersion) {
      await this.projection.saveUserRole(userId, roleId, env.aggregateVersion);
    }
    const rn = await this.projection.getRoleName(roleId);
    if (!rn || roleVersion > rn.lastVersion) {
      await this.projection.saveRoleName(roleId, roleName, roleVersion);
    }
  }
}

export type MessageAction =
  | { kind: 'ack' }
  | { kind: 'retry'; delayMs: number; retryCount: number }
  | { kind: 'dlq'; reason: string };

export interface RetryPolicy {
  delaysMs: number[];
  maxRetries: number;
}

/** Decides what to do with a delivery; the AMQP adapter only applies the action. */
export class MessageProcessor {
  constructor(
    private readonly handler: Pick<ProjectionHandler, 'handle'>,
    private readonly policy: RetryPolicy,
  ) {}

  async process(body: string, retryCount: number): Promise<MessageAction> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { kind: 'dlq', reason: 'invalid json' };
    }
    try {
      await this.handler.handle(parsed);
      return { kind: 'ack' };
    } catch (err) {
      if (err instanceof PermanentError) return { kind: 'dlq', reason: err.message };
      if (retryCount >= this.policy.maxRetries) {
        return { kind: 'dlq', reason: `max retries exceeded: ${err instanceof Error ? err.message : String(err)}` };
      }
      const delays = this.policy.delaysMs;
      return {
        kind: 'retry',
        retryCount: retryCount + 1,
        delayMs: delays[Math.min(retryCount, delays.length - 1)] ?? 5000,
      };
    }
  }
}
