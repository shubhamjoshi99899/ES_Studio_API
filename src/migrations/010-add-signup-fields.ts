import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignupFields1000000000009 implements MigrationInterface {
  name = 'AddSignupFields1000000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── users: new columns ────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "google_id"                      text        UNIQUE,
        ADD COLUMN IF NOT EXISTS "avatar_url"                     text,
        ADD COLUMN IF NOT EXISTS "email_verified"                 boolean     NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "verification_token"             text        UNIQUE,
        ADD COLUMN IF NOT EXISTS "verification_token_expires_at"  timestamp,
        ADD COLUMN IF NOT EXISTS "name"                           text
    `);

    // ── users: make passwordHash nullable (Google users have no password) ─────
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "passwordHash" DROP NOT NULL
    `);

    // ── workspace_subscriptions: make stripe_customer_id nullable ─────────────
    // Free Starter workspaces have no Stripe customer until they upgrade.
    await queryRunner.query(`
      ALTER TABLE "workspace_subscriptions"
        ALTER COLUMN "stripe_customer_id" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore stripe_customer_id NOT NULL (requires no NULL rows exist)
    await queryRunner.query(`
      ALTER TABLE "workspace_subscriptions"
        ALTER COLUMN "stripe_customer_id" SET NOT NULL
    `);

    // Restore passwordHash NOT NULL (requires no NULL rows exist)
    await queryRunner.query(`
      ALTER TABLE "users"
        ALTER COLUMN "passwordHash" SET NOT NULL
    `);

    // Drop the signup columns
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "name",
        DROP COLUMN IF EXISTS "verification_token_expires_at",
        DROP COLUMN IF EXISTS "verification_token",
        DROP COLUMN IF EXISTS "email_verified",
        DROP COLUMN IF EXISTS "avatar_url",
        DROP COLUMN IF EXISTS "google_id"
    `);
  }
}
