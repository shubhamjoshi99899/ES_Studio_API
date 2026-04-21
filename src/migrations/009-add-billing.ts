import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBilling1000000000008 implements MigrationInterface {
  name = 'AddBilling1000000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── workspace_subscriptions ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "subscription_plan_enum"   AS ENUM ('starter', 'pro', 'enterprise')
    `);
    await queryRunner.query(`
      CREATE TYPE "subscription_status_enum" AS ENUM ('active', 'past_due', 'cancelled', 'trialing')
    `);
    await queryRunner.query(`
      CREATE TABLE "workspace_subscriptions" (
        "id"                     uuid                         NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id"           uuid                         NOT NULL,
        "stripe_customer_id"     text                         NOT NULL,
        "stripe_subscription_id" text                         UNIQUE,
        "stripe_price_id"        text,
        "plan"                   "subscription_plan_enum"     NOT NULL DEFAULT 'starter',
        "status"                 "subscription_status_enum"   NOT NULL DEFAULT 'trialing',
        "current_period_start"   TIMESTAMP,
        "current_period_end"     TIMESTAMP,
        "cancel_at"              TIMESTAMP,
        "created_at"             TIMESTAMP                    NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMP                    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workspace_subscriptions"          PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workspace_subscriptions_workspace" UNIQUE ("workspace_id"),
        CONSTRAINT "UQ_workspace_subscriptions_customer"  UNIQUE ("stripe_customer_id"),
        CONSTRAINT "FK_workspace_subscriptions_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_workspace_subscriptions_workspace_id" ON "workspace_subscriptions" ("workspace_id")`,
    );

    // ── usage_records ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "usage_records" (
        "id"                    uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id"          uuid      NOT NULL,
        "metric"                text      NOT NULL,
        "quantity"              numeric   NOT NULL,
        "recorded_at"           TIMESTAMP NOT NULL DEFAULT now(),
        "stripe_usage_record_id" text,
        CONSTRAINT "PK_usage_records" PRIMARY KEY ("id"),
        CONSTRAINT "FK_usage_records_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_usage_records_workspace_id" ON "usage_records" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_usage_records_workspace_metric" ON "usage_records" ("workspace_id", "metric")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "usage_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_subscriptions"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "subscription_status_enum"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "subscription_plan_enum"`);
  }
}
