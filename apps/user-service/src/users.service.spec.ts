import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  AuthCredentialsClient,
  CredentialsConflictError,
  DependencyUnavailableError,
  EventBuilder,
  RoleClient,
  RoleNotFoundError,
  UserPatch,
  UserRecord,
  UserRepository,
} from './ports';
import { UsersService } from './users.service';

class FakeRepo implements UserRepository {
  users = new Map<string, UserRecord>();
  events: unknown[] = [];
  calls: string[] = [];
  async findById(id: string) {
    return this.users.get(id) ?? null;
  }
  async findByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async createPending(d: { id: string; email: string; name: string; roleId: string }) {
    const u: UserRecord = { ...d, status: 'PENDING', version: 1, createdAt: new Date(0) };
    this.users.set(u.id, u);
    this.calls.push('createPending');
    return u;
  }
  async persistWithOutbox(id: string, patch: UserPatch, build: EventBuilder) {
    const cur = this.users.get(id)!;
    const u = { ...cur, ...patch, version: cur.version + 1 };
    this.users.set(id, u);
    this.events.push(build(u));
    return u;
  }
  async deleteWithOutbox(id: string, build: EventBuilder) {
    const cur = this.users.get(id)!;
    this.events.push(build({ ...cur, version: cur.version + 1 }));
    this.users.delete(id);
  }
  async deletePending(id: string) {
    this.calls.push('deletePending');
    this.users.delete(id);
  }
  async list() {
    return { items: [...this.users.values()], total: this.users.size };
  }
  async findStalePending(before: Date) {
    return [...this.users.values()].filter((u) => u.status === 'PENDING' && u.createdAt < before);
  }
}

const input = { name: 'Ann', email: 'ann@x.io', password: 'S3cret-pass', roleId: 'r1' };
const actor = { userId: 'admin', roles: ['admin'] };

function setup(opts: { clock?: () => number } = {}) {
  const repo = new FakeRepo();
  const roles: jest.Mocked<RoleClient> = {
    getRole: jest.fn().mockResolvedValue({ id: 'r1', name: 'admin', version: 4, permissions: ['users:read'] }),
  };
  const auth: jest.Mocked<AuthCredentialsClient> = {
    putCredentials: jest.fn().mockResolvedValue(undefined),
    deleteCredentials: jest.fn().mockImplementation(async () => {
      repo.calls.push('deleteCredentials');
    }),
  };
  const svc = new UsersService(repo, roles, auth, { signupBudgetMs: 10000, reconcileGraceMs: 60000 }, opts.clock ?? Date.now);
  return { repo, roles, auth, svc };
}

describe('UsersService signup saga', () => {
  it('happy path: PENDING -> role -> credentials -> ACTIVE with user.created v2, no password stored', async () => {
    const { repo, auth, svc } = setup();
    const u = await svc.create(input, actor, 'cid', ['*']);
    expect(u.status).toBe('ACTIVE');
    expect(u.version).toBe(2);
    expect(auth.putCredentials).toHaveBeenCalledWith(
      u.id,
      { email: input.email, password: input.password, roleId: 'r1', roleName: 'admin', roleVersion: 4, rolePermissions: ['users:read'] },
      expect.any(Number),
      'cid',
    );
    expect(repo.events).toHaveLength(1);
    expect(repo.events[0]).toMatchObject({ type: 'user.created', aggregateVersion: 2 });
    expect(JSON.stringify(repo.events)).not.toContain(input.password);
  });

  it('duplicate email -> 409 without calling role/auth', async () => {
    const { roles, svc } = setup();
    await svc.create(input, actor, 'c', ['*']);
    roles.getRole.mockClear();
    await expect(svc.create(input, actor, 'c', ['*'])).rejects.toBeInstanceOf(ConflictException);
    expect(roles.getRole).not.toHaveBeenCalled();
  });

  it('role failure -> DELETE credentials BEFORE deletePending, then 503', async () => {
    const { repo, roles, svc } = setup();
    roles.getRole.mockRejectedValue(new DependencyUnavailableError('down'));
    await expect(svc.create(input, actor, 'c', ['*'])).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repo.calls).toEqual(['createPending', 'deleteCredentials', 'deletePending']);
    expect(repo.users.size).toBe(0);
  });

  it('compensation DELETE fails -> user stays PENDING, no deletePending', async () => {
    const { repo, roles, auth, svc } = setup();
    roles.getRole.mockRejectedValue(new RoleNotFoundError('r1'));
    auth.deleteCredentials.mockRejectedValue(new DependencyUnavailableError('down'));
    await expect(svc.create(input, actor, 'c', ['*'])).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repo.calls).not.toContain('deletePending');
    expect([...repo.users.values()][0].status).toBe('PENDING');
  });

  it('auth 409 -> compensates and answers 409', async () => {
    const { repo, auth, svc } = setup();
    auth.putCredentials.mockRejectedValue(new CredentialsConflictError('u'));
    await expect(svc.create(input, actor, 'c', ['*'])).rejects.toBeInstanceOf(ConflictException);
    expect(repo.users.size).toBe(0);
  });

  it('exhausted budget: no call is attempted, compensates, 503', async () => {
    let calls = 0;
    const { roles, repo, svc } = setup({ clock: () => (calls++ === 0 ? 0 : 20000) });
    await expect(svc.create(input, actor, 'c', ['*'])).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(roles.getRole).not.toHaveBeenCalled();
    expect(repo.calls).toContain('deletePending');
  });
});

describe('UsersService lifecycle', () => {
  it('update DISABLED bumps version + user.updated; delete emits user.deleted; role assign emits role payload', async () => {
    const { repo, svc } = setup();
    const u = await svc.create(input, actor, 'c', ['*']);
    repo.events.length = 0;
    await svc.update(u.id, { status: 'DISABLED' }, actor, 'c');
    await svc.assignRole(u.id, 'r1', actor, 'c', ['*']);
    await svc.remove(u.id, actor, 'c');
    expect(repo.events).toMatchObject([
      { type: 'user.updated', aggregateVersion: 3, payload: { status: 'DISABLED' } },
      {
        type: 'user.role.assigned',
        aggregateVersion: 4,
        payload: { userId: u.id, roleId: 'r1', roleName: 'admin', roleVersion: 4, rolePermissions: ['users:read'] },
      },
      { type: 'user.deleted', aggregateVersion: 5 },
    ]);
    await expect(svc.get(u.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assignRole with unknown role -> 404 and no event', async () => {
    const { repo, roles, svc } = setup();
    const u = await svc.create(input, actor, 'c', ['*']);
    repo.events.length = 0;
    roles.getRole.mockRejectedValue(new RoleNotFoundError('x'));
    await expect(svc.assignRole(u.id, 'x', actor, 'c', ['*'])).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.events).toHaveLength(0);
  });

  it('no escalation: assigning/creating with a role beyond the actor permissions -> 403; self role change -> 403', async () => {
    const { repo, roles, svc } = setup();
    const u = await svc.create(input, actor, 'c', ['*']);
    repo.events.length = 0;
    roles.getRole.mockResolvedValue({ id: 'r2', name: 'admin', version: 1, permissions: ['*'] });
    const writer = ['users:write', 'users:read'];
    await expect(svc.assignRole(u.id, 'r2', actor, 'c', writer)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.create({ ...input, email: 'b@x.io', roleId: 'r2' }, actor, 'c', writer)).rejects.toBeInstanceOf(ForbiddenException);
    roles.getRole.mockResolvedValue({ id: 'r3', name: 'low', version: 1, permissions: ['users:read'] });
    await expect(svc.assignRole(u.id, 'r3', { userId: u.id, roles: [] }, 'c', writer)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.events).toHaveLength(0);
    await expect(svc.assignRole(u.id, 'r3', actor, 'c', writer)).resolves.toBeDefined();
  });

  it('reconcile only compensates stale PENDING and keeps those whose DELETE fails', async () => {
    const { repo, auth, svc } = setup({ clock: () => 120000 });
    repo.users.set('old', { id: 'old', email: 'a', name: 'a', roleId: 'r', status: 'PENDING', version: 1, createdAt: new Date(0) });
    repo.users.set('bad', { id: 'bad', email: 'b', name: 'b', roleId: 'r', status: 'PENDING', version: 1, createdAt: new Date(0) });
    repo.users.set('fresh', { id: 'fresh', email: 'c', name: 'c', roleId: 'r', status: 'PENDING', version: 1, createdAt: new Date(100000) });
    repo.users.set('act', { id: 'act', email: 'd', name: 'd', roleId: 'r', status: 'ACTIVE', version: 2, createdAt: new Date(0) });
    auth.deleteCredentials.mockImplementation(async (id) => {
      if (id === 'bad') throw new DependencyUnavailableError('x');
    });
    expect(await svc.reconcilePending()).toBe(1);
    expect([...repo.users.keys()].sort()).toEqual(['act', 'bad', 'fresh']);
  });
});
