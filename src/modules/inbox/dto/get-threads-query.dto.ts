import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum InboxThreadStatus {
  OPEN = 'open',
  PENDING = 'pending',
  RESOLVED = 'resolved',
  SNOOZED = 'snoozed',
}

export enum InboxPlatform {
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  LINKEDIN = 'linkedin',
  TIKTOK = 'tiktok',
}

export class GetThreadsQueryDto {
  @ApiProperty({
    required: false,
    enum: InboxThreadStatus,
  })
  @IsOptional()
  @IsEnum(InboxThreadStatus)
  status?: InboxThreadStatus;

  @ApiProperty({
    required: false,
    enum: InboxPlatform,
  })
  @IsOptional()
  @IsEnum(InboxPlatform)
  platform?: InboxPlatform;

  @ApiProperty({
    required: false,
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({
    required: false,
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
