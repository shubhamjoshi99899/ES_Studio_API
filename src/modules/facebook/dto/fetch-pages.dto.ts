import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class FetchPagesDto {
  @ApiProperty({
    example: 'EAABsbCS1iHgBAKZCZA...',
  })
  @IsString()
  shortLivedToken: string;
}
