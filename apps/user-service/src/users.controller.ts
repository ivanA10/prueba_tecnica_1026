import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@toka/jwt-guard';
import { getCorrelationId } from '@toka/logger';
import { PERMISSIONS } from '@toka/contracts';
import type { EventActor } from '@toka/contracts';
import { AssignRoleDto, CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

interface AuthedReq {
  user: { sub: string; roles: string[] };
}

const actorOf = (req: AuthedReq): EventActor => ({ userId: req.user.sub, roles: req.user.roles });
const cid = (): string => getCorrelationId() ?? randomUUID();

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  async create(@Body() dto: CreateUserDto, @Req() req: AuthedReq) {
    const u = await this.users.create(dto, actorOf(req), cid());
    return { id: u.id, name: u.name, email: u.email, roleId: u.roleId, status: u.status };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  list(@Query() q: ListUsersQuery) {
    return this.users.list(q.page, q.limit);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: AuthedReq) {
    return this.users.update(id, dto, actorOf(req), cid());
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  @HttpCode(204)
  async remove(@Param('id') id: string, @Req() req: AuthedReq): Promise<void> {
    await this.users.remove(id, actorOf(req), cid());
  }

  @Put(':id/role')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto, @Req() req: AuthedReq) {
    return this.users.assignRole(id, dto.roleId, actorOf(req), cid());
  }
}
