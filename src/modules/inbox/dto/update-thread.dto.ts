import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { InboxThreadStatus } from './get-threads-query.dto';

export class UpdateThreadDto {
  @ApiProperty({
    required: false,
    enum: InboxThreadStatus,
  })
  @IsOptional()
  @IsEnum(InboxThreadStatus)
  status?: InboxThreadStatus;

  @ApiProperty({
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;
}
