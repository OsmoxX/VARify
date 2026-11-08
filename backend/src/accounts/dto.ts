import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateProfileDto {
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(254) email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[\w.@+-]+$/, { message: 'username may contain letters, digits and @ . + - _ only' })
  username?: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(72) currentPassword!: string;
  @IsString() @MinLength(8) @MaxLength(72) newPassword!: string;
}

export class CheckoutDto {
  @IsOptional() @IsIn(['pl', 'en']) locale?: 'pl' | 'en';
}
