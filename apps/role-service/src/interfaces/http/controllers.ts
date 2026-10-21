import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, AuthenticatedUser } from '@toka/jwt-guard';
import { RoleService } from '../../application/role-service';
import type { Role } from '../../domain/role';
import { RoleBodyDto } from './dto';
import { Roles, RolesGuard } from './roles.guard';

type Authed = { user: AuthenticatedUser };

const toDto = (r: Role) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  permissions: r.permissions,
  version: r.version,
});

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(private readonly roles: RoleService) {}

  @Post()
  @Roles('admin')
  async create(@Body() dto: RoleBodyDto, @Req() req: Authed) {
    const role = await this.roles.create(
      { name: dto.name, description: dto.description ?? null, permissions: dto.permissions },
      { userId: req.user.sub, roles: req.user.roles },
    );
    return toDto(role);
  }

  @Get()
  @Roles('admin')
  async list() {
    return (await this.roles.list()).map(toDto);
  }

  @Get(':id')
  @Roles('admin', 'service')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return toDto(await this.roles.get(id));
  }

  @Put(':id')
  @Roles('admin')
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

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  ready() {
    return { status: 'ok' };
  }
}
