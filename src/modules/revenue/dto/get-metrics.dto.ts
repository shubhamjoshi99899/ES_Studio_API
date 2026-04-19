import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class GetMetricsDto {
  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-04-18' })
  @IsDateString()
  endDate: string;
}
