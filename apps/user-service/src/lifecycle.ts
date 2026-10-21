import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UserConfig } from './config';
import { UsersService, USER_CONFIG } from './users.service';

/** Periodic reconciliation of orphaned PENDING users (compensation only). */
@Injectable()
export class ReconcileScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(ReconcileScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly users: UsersService,
    @Inject(USER_CONFIG) private readonly config: Pick<UserConfig, 'reconcileIntervalMs'>,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      this.users.reconcilePending().catch((e: Error) => this.log.warn(`reconcile failed: ${e.message}`));
    }, this.config.reconcileIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

type SeedConfig = Pick<UserConfig, 'adminSeedEmail' | 'adminSeedPassword' | 'adminSeedRoleId'>;

/** Creates the first admin at startup (idempotent by email). Never logs the password. */
@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly log = new Logger(AdminSeedService.name);
  private readonly retry: { attempts: number; delayMs: number };

  constructor(
    private readonly users: UsersService,
    @Inject(USER_CONFIG) private readonly config: SeedConfig,
    @Optional() @Inject('SEED_RETRY') retry?: { attempts: number; delayMs: number },
  ) {
    this.retry = retry ?? { attempts: 10, delayMs: 3000 };
  }

  onApplicationBootstrap(): void {
    if (!this.config.adminSeedEmail || !this.config.adminSeedPassword) return;
    void this.seed();
  }

  /** Returns true when the admin exists (created now or before). */
  async seed(): Promise<boolean> {
    const { adminSeedEmail: email, adminSeedPassword: password, adminSeedRoleId: roleId } = this.config;
    if (!email || !password) return false;
    for (let i = 1; i <= this.retry.attempts; i++) {
      try {
        if (await this.users.existsByEmail(email)) {
          this.log.log('admin seed skipped: already exists');
          return true;
        }
        await this.users.create({ name: 'Administrator', email, password, roleId }, 'system', randomUUID());
        this.log.log('admin seed created');
        return true;
      } catch (e) {
        this.log.warn(`admin seed attempt ${i}/${this.retry.attempts} failed: ${(e as Error).message}`);
        if (i < this.retry.attempts) await new Promise((r) => setTimeout(r, this.retry.delayMs));
      }
    }
    return false;
  }
}
