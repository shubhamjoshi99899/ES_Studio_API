import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordReset1000000000011 implements MigrationInterface {
  name = 'AddPasswordReset1000000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "reset_token" text UNIQUE,
        ADD COLUMN IF NOT EXISTS "reset_token_expires_at" timestamp
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "reset_token_expires_at",
        DROP COLUMN IF EXISTS "reset_token"
    `);
  }
}
