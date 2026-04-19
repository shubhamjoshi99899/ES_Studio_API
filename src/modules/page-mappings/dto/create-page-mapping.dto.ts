import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePageMappingDto {
  @ApiProperty({ example: 'Sports' })
  @IsString()
  category: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'growth',
  })
  @IsOptional()
  @IsString()
  team?: string | null;

  @ApiProperty({ example: 'facebook' })
  @IsString()
  platform: string;

  @ApiProperty({ example: 'ES Studio Page' })
  @IsString()
  pageName: string;

  @ApiProperty({ example: 'facebook' })
  @IsString()
  utmSource: string;

  @ApiProperty({
    type: [String],
    example: ['paid-social', 'organic-social'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  utmMediums: string[];
}
