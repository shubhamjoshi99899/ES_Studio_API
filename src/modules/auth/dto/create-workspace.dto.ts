import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const TEAM_SIZE_OPTIONS = ['1-5', '6-20', '21-100', '101-500', '500+'] as const;
const INDUSTRY_OPTIONS = [
  'media',
  'agency',
  'ecommerce',
  'creator',
  'enterprise',
  'other',
] as const;
const PLATFORM_OPTIONS = [
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
] as const;

export class CreateWorkspaceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  orgName: string;

  @ApiProperty({
    description: 'Lowercase letters, numbers, hyphens only',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MinLength(2)
  @MaxLength(50)
  slug: string;

  @ApiProperty()
  @IsEnum(TEAM_SIZE_OPTIONS)
  teamSize: (typeof TEAM_SIZE_OPTIONS)[number];

  @ApiProperty()
  @IsEnum(INDUSTRY_OPTIONS)
  industry: (typeof INDUSTRY_OPTIONS)[number];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(PLATFORM_OPTIONS, { each: true })
  platforms: Array<(typeof PLATFORM_OPTIONS)[number]>;
}
