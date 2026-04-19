import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdatePageMappingDto {
  @ApiProperty({
    required: false,
    example: 'Sports',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'growth',
  })
  @IsOptional()
  @IsString()
  team?: string | null;

  @ApiProperty({
    required: false,
    example: 'facebook',
  })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiProperty({
    required: false,
    example: 'ES Studio Page',
  })
  @IsOptional()
  @IsString()
  pageName?: string;

  @ApiProperty({
    required: false,
    example: 'facebook',
  })
  @IsOptional()
  @IsString()
  utmSource?: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['paid-social', 'organic-social'],
  })
  @IsOptional()
  @IsString({ each: true })
  utmMediums?: string[];
}
