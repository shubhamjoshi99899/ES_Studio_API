import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

export class GetPostsDto {
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
