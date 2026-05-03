import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublishingStatus1777814740796 implements MigrationInterface {
  name = 'AddPublishingStatus1777814740796';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL supports ADD VALUE without locking the table.
    // IF NOT EXISTS guards against re-running on a schema that already has it.
    await queryRunner.query(`
      ALTER TYPE "content_post_status_enum"
        ADD VALUE IF NOT EXISTS 'publishing' AFTER 'scheduled'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL < 16 has no DROP VALUE. Safest rollback: recreate the type
    // without 'publishing', migrating any in-flight rows back to 'scheduled'.
    await queryRunner.query(`
      UPDATE "content_posts" SET "status" = 'scheduled' WHERE "status" = 'publishing'
    `);
    await queryRunner.query(`
      ALTER TABLE "content_posts"
        ALTER COLUMN "status" TYPE character varying
    `);
    await queryRunner.query(`DROP TYPE "content_post_status_enum"`);
    await queryRunner.query(`
      CREATE TYPE "content_post_status_enum" AS ENUM (
        'draft', 'review', 'approved', 'scheduled', 'published', 'failed'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "content_posts"
        ALTER COLUMN "status" TYPE "content_post_status_enum"
          USING "status"::"content_post_status_enum"
    `);
  }
}
