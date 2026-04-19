import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class GetAggregatedDataDto {
  @ApiProperty({
    type: [String],
    example: ['1234567890', '17841400000000000'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  profileIds: string[];

  @ApiProperty({
    required: false,
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number;

  @ApiProperty({
    required: false,
    example: '2026-04-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    required: false,
    example: '2026-04-18',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
