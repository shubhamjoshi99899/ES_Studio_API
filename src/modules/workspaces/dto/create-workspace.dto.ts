import {
  IsString,
  IsNotEmpty,
  Matches,
  IsArray,
  ArrayNotEmpty,
} from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  orgName: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug may only contain lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @IsString()
  @IsNotEmpty()
  teamSize: string;

  @IsString()
  @IsNotEmpty()
  industry: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  platforms: string[];
}
