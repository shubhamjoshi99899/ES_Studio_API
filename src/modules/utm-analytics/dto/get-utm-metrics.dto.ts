import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Array.isArray(value) ? value : [String(value)];
};

export class GetUtmMetricsDto {
  @ApiProperty({
    enum: ['daily', 'weekly', 'monthly'],
    example: 'daily',
  })
  @IsIn(['daily', 'weekly', 'monthly'])
  rollup: 'daily' | 'weekly' | 'monthly';

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-04-18' })
  @IsDateString()
  endDate: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['facebook', 'instagram'],
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  utmSource?: string[];

  @ApiProperty({
    required: false,
    type: [String],
    example: ['paid-social'],
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  utmMedium?: string[];

  @ApiProperty({
    required: false,
    type: [String],
    example: ['spring-launch'],
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  utmCampaign?: string[];
}
