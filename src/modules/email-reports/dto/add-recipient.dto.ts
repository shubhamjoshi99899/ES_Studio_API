import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class AddRecipientDto {
  @ApiProperty({
    example: 'ops@example.com',
  })
  @IsEmail()
  email: string;
}
