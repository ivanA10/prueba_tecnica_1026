import 'reflect-metadata';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { AuthenticatedUser, isServiceToken } from './options';

export const REQUIRED_PERMISSIONS = 'toka:required_permissions';
export const ALLOW_SERVICE_TOKEN = 'toka:allow_service_token';

const WILDCARD = '*';

// Local copy (jwt-guard must not depend on other @toka packages).
function hasPermission(granted: readonly string[] | undefined, required: string): boolean {
  if (!granted) return false;
  return granted.includes(WILDCARD) || granted.includes(required);
}

export const RequirePermissions = (...perms: string[]) => SetMetadata(REQUIRED_PERMISSIONS, perms);

/** Lets service tokens (scope `svc:internal`, issued only via client_credentials) pass PermissionsGuard on this route. */
export const AllowServiceToken = () => SetMetadata(ALLOW_SERVICE_TOKEN, true);

/**
 * Usage: `@UseGuards(JwtAuthGuard, PermissionsGuard)` — must run AFTER JwtAuthGuard,
 * which populates `request.user`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  // Reads metadata via reflect-metadata (what Nest's SetMetadata/Reflector use) to avoid an @nestjs/core dependency.
  private meta<T>(key: string, context: ExecutionContext): T | undefined {
    return (Reflect.getMetadata(key, context.getHandler()) ?? Reflect.getMetadata(key, context.getClass())) as
      | T
      | undefined;
  }

  canActivate(context: ExecutionContext): boolean {
    const required = this.meta<string[]>(REQUIRED_PERMISSIONS, context);
    if (!required) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (isServiceToken(user) && this.meta<boolean>(ALLOW_SERVICE_TOKEN, context)) return true;

    for (const perm of required) {
      if (!hasPermission(user?.permissions, perm)) {
        throw new ForbiddenException(`Permiso requerido: ${perm}`);
      }
    }
    return true;
  }
}
