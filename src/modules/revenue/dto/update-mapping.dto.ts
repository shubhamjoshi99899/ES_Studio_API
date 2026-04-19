import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateMappingDto {
  @ApiProperty({
    required: false,
    nullable: true,
    example: 'growth',
  })
  @IsOptional()
  @IsString()
  team?: string | null;
}
