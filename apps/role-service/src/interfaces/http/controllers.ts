import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '@toka/contracts';
import { AllowServiceToken, AuthenticatedUser, JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@toka/jwt-guard';
import { RoleService } from '../../application/role-service';
import type { Role } from '../../domain/role';
import { RoleBodyDto } from './dto';

type Authed = { user: AuthenticatedUser };

const toDto = (r: Role) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  permissions: r.permissions,
  version: r.version,
});

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly roles: RoleService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.ROLES_WRITE)
  async create(@Body() dto: RoleBodyDto, @Req() req: Authed) {
    const role = await this.roles.create(
      { name: dto.name, description: dto.description ?? null, permissions: dto.permissions },
      { userId: req.user.sub, roles: req.user.roles },
    );
    return toDto(role);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  async list() {
    return (await this.roles.list()).map(toDto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @AllowServiceToken()
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toDto(await this.roles.get(id));
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.ROLES_WRITE)
  @HttpCode(200)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RoleBodyDto, @Req() req: Authed) {
    const role = await this.roles.update(
      id,
      { name: dto.name, description: dto.description ?? null, permissions: dto.permissions },
      { userId: req.user.sub, roles: req.user.roles },
      dto.version,
    );
    return toDto(role);
  }
}

/** Dependency checks for /ready (Postgres, Redis, AMQP topology). */
export const READINESS = 'READINESS';
export type ReadinessCheck = () => Promise<Record<string, boolean>>;

@Controller()
export class HealthController {
  constructor(@Optional() @Inject(READINESS) private readonly readiness?: ReadinessCheck) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const checks = this.readiness ? await this.readiness() : {};
    if (Object.values(checks).some((ok) => !ok)) {
      throw new ServiceUnavailableException({ status: 'unavailable', checks });
    }
    return { status: 'ready', checks };
  }
}
