import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  @Transform(trim) @IsEmail() @MaxLength(254) email!: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[\w.@+-]+$/, { message: 'username may contain letters, digits and @ . + - _ only' })
  username!: string;

  @IsString() @MinLength(8) @MaxLength(72) password!: string; // bcrypt ucina po 72 bajtach
}

export class LoginDto {
  @Transform(trim) @IsEmail() email!: string;
  @IsString() @MaxLength(72) password!: string;
}
