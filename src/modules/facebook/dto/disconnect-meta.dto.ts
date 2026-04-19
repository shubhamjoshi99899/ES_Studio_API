import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class DisconnectMetaDto {
  @ApiProperty({
    example: true,
  })
  @IsBoolean()
  deleteData: boolean;

  @ApiProperty({
    required: false,
    enum: ['facebook', 'instagram', 'all'],
    example: 'all',
  })
  @IsOptional()
  @IsIn(['facebook', 'instagram', 'all'])
  platform?: 'facebook' | 'instagram' | 'all';
}
