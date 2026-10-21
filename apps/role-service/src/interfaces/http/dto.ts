import { isKnownPermission, WILDCARD } from '@toka/contracts';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface, MinLength } from 'class-validator';

@ValidatorConstraint({ name: 'knownPermissions', async: false })
class KnownPermissions implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return Array.isArray(value) && value.every((p) => typeof p === 'string' && (p === WILDCARD || isKnownPermission(p)));
  }
  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must contain only '*' or known permissions`;
  }
}

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
  @Validate(KnownPermissions)
  permissions!: string[];

  /** Optional optimistic-concurrency check (PUT only). */
  @IsOptional()
  @IsInt()
  version?: number;
}
