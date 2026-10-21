import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RoleBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  permissions!: string[];

  /** Optional optimistic-concurrency check (PUT only). */
  @IsOptional()
  @IsInt()
  version?: number;
}
