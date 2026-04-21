import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateAlertRuleDto {
  @ApiProperty({ example: 'Traffic drop 30%', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: 'traffic',
    enum: ['traffic', 'revenue', 'engagement'],
    required: false,
  })
  @IsOptional()
  @IsIn(['traffic', 'revenue', 'engagement'])
  metric_family?: 'traffic' | 'revenue' | 'engagement';

  @ApiProperty({
    example: 'pct_drop',
    enum: ['gt', 'lt', 'pct_drop', 'pct_rise'],
    required: false,
  })
  @IsOptional()
  @IsIn(['gt', 'lt', 'pct_drop', 'pct_rise'])
  operator?: 'gt' | 'lt' | 'pct_drop' | 'pct_rise';

  @ApiProperty({ example: 30, required: false })
  @IsOptional()
  @IsNumber()
  threshold?: number;

  @ApiProperty({ example: '7d', enum: ['1d', '7d', '30d'], required: false })
  @IsOptional()
  @IsIn(['1d', '7d', '30d'])
  time_window?: '1d' | '7d' | '30d';

  @ApiProperty({ example: ['email'], type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['email', 'in_app'], { each: true })
  channels?: string[];

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
