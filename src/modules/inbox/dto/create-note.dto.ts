import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateNoteDto {
  @ApiProperty({
    example: 'Customer prefers follow-up over email next week.',
  })
  @IsString()
  @IsNotEmpty()
  body: string;
}
