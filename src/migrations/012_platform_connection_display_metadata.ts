import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlatformConnectionDisplayMetadata1000000000012 implements MigrationInterface {
  name = 'PlatformConnectionDisplayMetadata1000000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_connections"
        ADD COLUMN IF NOT EXISTS "display_name" character varying(255),
        ADD COLUMN IF NOT EXISTS "username" character varying(255),
        ADD COLUMN IF NOT EXISTS "avatar_url" character varying(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_connections"
        DROP COLUMN IF EXISTS "avatar_url",
        DROP COLUMN IF EXISTS "username",
        DROP COLUMN IF EXISTS "display_name"
    `);
  }
}
