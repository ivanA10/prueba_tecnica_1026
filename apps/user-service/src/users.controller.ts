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
import { JwtAuthGuard } from '@toka/jwt-guard';
import { getCorrelationId } from '@toka/logger';
import type { EventActor } from '@toka/contracts';
import { AssignRoleDto, CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/user.dto';
import { Roles, RolesGuard } from './roles.guard';
import { UsersService } from './users.service';

interface AuthedReq {
  user: { sub: string; roles: string[] };
}

const actorOf = (req: AuthedReq): EventActor => ({ userId: req.user.sub, roles: req.user.roles });
const cid = (): string => getCorrelationId() ?? randomUUID();

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  async create(@Body() dto: CreateUserDto, @Req() req: AuthedReq) {
    const u = await this.users.create(dto, actorOf(req), cid());
    return { id: u.id, name: u.name, email: u.email, roleId: u.roleId, status: u.status };
  }

  @Get()
  list(@Query() q: ListUsersQuery) {
    return this.users.list(q.page, q.limit);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: AuthedReq) {
    return this.users.update(id, dto, actorOf(req), cid());
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Req() req: AuthedReq): Promise<void> {
    await this.users.remove(id, actorOf(req), cid());
  }

  @Put(':id/role')
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto, @Req() req: AuthedReq) {
    return this.users.assignRole(id, dto.roleId, actorOf(req), cid());
  }
}
