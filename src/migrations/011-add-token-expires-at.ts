import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenExpiresAt1000000000010 implements MigrationInterface {
  name = 'AddTokenExpiresAt1000000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_connections"
        ADD COLUMN IF NOT EXISTS "token_expires_at" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_connections"
        DROP COLUMN IF EXISTS "token_expires_at"
    `);
  }
}
