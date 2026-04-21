import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsString,
} from 'class-validator';

export class CreateAlertRuleDto {
  @ApiProperty({ example: 'Traffic drop 30%' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'traffic', enum: ['traffic', 'revenue', 'engagement'] })
  @IsIn(['traffic', 'revenue', 'engagement'])
  metric_family: 'traffic' | 'revenue' | 'engagement';

  @ApiProperty({ example: 'pct_drop', enum: ['gt', 'lt', 'pct_drop', 'pct_rise'] })
  @IsIn(['gt', 'lt', 'pct_drop', 'pct_rise'])
  operator: 'gt' | 'lt' | 'pct_drop' | 'pct_rise';

  @ApiProperty({ example: 30 })
  @IsNumber()
  threshold: number;

  @ApiProperty({ example: '7d', enum: ['1d', '7d', '30d'] })
  @IsIn(['1d', '7d', '30d'])
  time_window: '1d' | '7d' | '30d';

  @ApiProperty({ example: ['email'], type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['email', 'in_app'], { each: true })
  channels: string[];

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;
}
