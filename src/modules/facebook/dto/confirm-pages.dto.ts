import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class SelectedPageDto {
  @ApiProperty({ example: '1234567890' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'ES Studio Page' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'EAABsbCS1iHgBAKZCZA...' })
  @IsString()
  access_token: string;
}

class SelectedInstagramAccountDto {
  @ApiProperty({ example: '17841400000000000' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'esstudio' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'EAABsbCS1iHgBAKZCZA...' })
  @IsString()
  access_token: string;
}

export class ConfirmPagesDto {
  @ApiProperty({
    required: false,
    type: [SelectedPageDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedPageDto)
  selectedPages?: SelectedPageDto[];

  @ApiProperty({
    required: false,
    type: [SelectedInstagramAccountDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedInstagramAccountDto)
  selectedIgAccounts?: SelectedInstagramAccountDto[];
}
