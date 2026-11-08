import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class LiveQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,10}$/)
  league?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  top?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class EventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class LineupsQueryDto {
  @IsOptional()
  @IsIn(['home', 'away'])
  team?: 'home' | 'away';
}
