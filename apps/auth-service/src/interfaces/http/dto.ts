import { IsArray, IsInt, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class OAuthTokenDto {
  @IsString()
  grant_type!: string;

  @IsString()
  client_id!: string;

  @IsString()
  client_secret!: string;

  @IsString()
  audience!: string;
}

export class UpsertCredentialDto {
  @IsString()
  @MinLength(3)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsString()
  roleName?: string;

  @IsOptional()
  @IsInt()
  roleVersion?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rolePermissions?: string[];
}
