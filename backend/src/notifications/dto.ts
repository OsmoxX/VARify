import { Type } from 'class-transformer';
import { IsNotEmptyObject, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';

class PushKeysDto {
  @IsString() @MaxLength(255) p256dh!: string;
  @IsString() @MaxLength(255) auth!: string;
}

export class PushSubscribeDto {
  @IsUrl({ require_tld: false, protocols: ['https'] }) @MaxLength(500) endpoint!: string;
  @IsNotEmptyObject() @ValidateNested() @Type(() => PushKeysDto) keys!: PushKeysDto;
}

export class PushUnsubscribeDto {
  @IsString() @MaxLength(500) endpoint!: string;
}
