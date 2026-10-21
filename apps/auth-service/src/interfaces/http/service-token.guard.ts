import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser, isServiceToken } from '@toka/jwt-guard';

export const INTERNAL_AUDIENCE = 'auth-service';

/**
 * Internal endpoints: only client_credentials tokens (scope `svc:internal`) minted for this
 * service's audience. A user token never qualifies, whatever its role is called.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    const aud = user ? (Array.isArray(user.aud) ? user.aud : [user.aud]) : [];
    if (isServiceToken(user) && aud.includes(INTERNAL_AUDIENCE)) return true;
    throw new ForbiddenException('Service token required');
  }
}
