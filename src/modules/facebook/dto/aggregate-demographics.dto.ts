import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class AggregateDemographicsDto {
  @ApiProperty({
    type: [String],
    example: ['1234567890', '17841400000000000'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  profileIds: string[];
}
