import { ApiProperty } from '@nestjs/swagger';

export class MeWorkspaceDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    example: 'Acme Marketing',
  })
  name: string;

  @ApiProperty({
    example: 'starter',
    enum: ['starter', 'pro', 'enterprise'],
  })
  plan: string;

  @ApiProperty({
    example: 'admin',
  })
  role: string;
}

export class MeResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  userId: string;

  @ApiProperty({
    example: 'admin@example.com',
  })
  email: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    nullable: true,
  })
  currentWorkspaceId: string | null;

  @ApiProperty({
    type: [MeWorkspaceDto],
  })
  workspaces: MeWorkspaceDto[];
}
