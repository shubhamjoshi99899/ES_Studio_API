import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendReplyDto {
  @ApiProperty({
    example: 'Thanks for reaching out. We will get back to you shortly.',
  })
  @IsString()
  @IsNotEmpty()
  body: string;
}
