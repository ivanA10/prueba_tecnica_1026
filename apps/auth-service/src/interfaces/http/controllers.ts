import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard, AuthenticatedUser } from '@toka/jwt-guard';
import type { AuthConfig } from '../../config/config';
import { CredentialsService } from '../../application/credentials-service';
import { TOKENS } from '../../application/ports';
import { AuthService, LoginResult, ServiceTokenService } from '../../application/token-service';
import type { JoseTokenIssuer } from '../../infrastructure/crypto/crypto';
import { LoginDto, OAuthTokenDto, UpsertCredentialDto } from './dto';
import { Roles, RolesGuard } from './roles.guard';

export const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/auth';

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0 && part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

type AuthedRequest = Request & { user: AuthenticatedUser };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(TOKENS.Config) private readonly config: AuthConfig,
  ) {}

  private setCookie(res: Response, r: LoginResult): void {
    res.cookie(REFRESH_COOKIE, r.refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.cookieSecure,
      path: COOKIE_PATH,
      maxAge: r.refreshMaxAgeSeconds * 1000,
    });
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.email, dto.password, req.ip);
    this.setCookie(res, r);
    return { accessToken: r.accessToken, expiresIn: r.expiresIn };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.refresh(readCookie(req.headers.cookie, REFRESH_COOKIE));
    this.setCookie(res, r);
    return { accessToken: r.accessToken, expiresIn: r.expiresIn };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.user, readCookie(req.headers.cookie, REFRESH_COOKIE));
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }
}

@Controller('oauth')
export class OAuthController {
  constructor(private readonly tokens: ServiceTokenService) {}

  @Post('token')
  @HttpCode(200)
  token(@Body() dto: OAuthTokenDto) {
    if (dto.grant_type !== 'client_credentials') throw new BadRequestException('unsupported_grant_type');
    return this.tokens.issue(dto.client_id, dto.client_secret, dto.audience);
  }
}

@Controller('.well-known')
export class JwksController {
  constructor(@Inject(TOKENS.Issuer) private readonly issuer: JoseTokenIssuer) {}

  @Get('jwks.json')
  jwks() {
    return this.issuer.getJwks();
  }
}

@Controller('internal/credentials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('service')
export class InternalCredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Put(':userId')
  async upsert(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpsertCredentialDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created } = await this.credentials.upsert(userId, dto);
    res.status(created ? 201 : 200);
    return { userId, status: created ? 'created' : 'updated' };
  }

  @Delete(':userId')
  @HttpCode(204)
  async remove(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    await this.credentials.remove(userId);
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
