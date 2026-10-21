import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AllowServiceToken, PermissionsGuard, RequirePermissions } from './permissions';

class Ctl {
  @RequirePermissions('users:read', 'users:write')
  both() {}
  @RequirePermissions('users:read')
  @AllowServiceToken()
  svc() {}
  open() {}
}

function ctx(method: keyof Ctl, user: object): ExecutionContext {
  return {
    getHandler: () => Ctl.prototype[method],
    getClass: () => Ctl,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard();

  it('allows without metadata, with wildcard, and denies missing permission', () => {
    expect(guard.canActivate(ctx('open', { roles: [], permissions: [] }))).toBe(true);
    expect(guard.canActivate(ctx('both', { roles: [], permissions: ['*'] }))).toBe(true);
    expect(() => guard.canActivate(ctx('both', { roles: [], permissions: ['users:read'] }))).toThrow(
      new ForbiddenException('Permiso requerido: users:write'),
    );
  });

  it('service token only passes on AllowServiceToken routes', () => {
    const user = { roles: ['service'], permissions: [] };
    expect(guard.canActivate(ctx('svc', user))).toBe(true);
    expect(() => guard.canActivate(ctx('both', user))).toThrow(ForbiddenException);
  });
});
