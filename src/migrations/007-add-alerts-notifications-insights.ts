import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlertsNotificationsInsights1000000000006 implements MigrationInterface {
  name = 'AddAlertsNotificationsInsights1000000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // alert_rules
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "alert_rules_metric_family_enum" AS ENUM ('traffic', 'revenue', 'engagement')
    `);
    await queryRunner.query(`
      CREATE TYPE "alert_rules_operator_enum" AS ENUM ('gt', 'lt', 'pct_drop', 'pct_rise')
    `);
    await queryRunner.query(`
      CREATE TYPE "alert_rules_time_window_enum" AS ENUM ('1d', '7d', '30d')
    `);
    await queryRunner.query(`
      CREATE TABLE "alert_rules" (
        "id"             uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id"   uuid                              NOT NULL,
        "name"           text                              NOT NULL,
        "metric_family"  "alert_rules_metric_family_enum"  NOT NULL,
        "operator"       "alert_rules_operator_enum"       NOT NULL,
        "threshold"      numeric                           NOT NULL,
        "time_window"    "alert_rules_time_window_enum"    NOT NULL,
        "channels"       text[]                            NOT NULL DEFAULT '{}',
        "enabled"        boolean                           NOT NULL DEFAULT true,
        "last_evaluated" TIMESTAMP,
        "last_triggered" TIMESTAMP,
        "created_at"     TIMESTAMP                         NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP                         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_alert_rules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_alert_rules_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_alert_rules_workspace_id" ON "alert_rules" ("workspace_id")`,
    );

    // ------------------------------------------------------------------
    // in_app_notifications
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "in_app_notifications" (
        "id"           uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid      NOT NULL,
        "user_id"      uuid,
        "type"         text      NOT NULL,
        "title"        text      NOT NULL,
        "body"         text      NOT NULL,
        "read_at"      TIMESTAMP,
        "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_in_app_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_in_app_notifications_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_in_app_notifications_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_in_app_notifications_workspace_id" ON "in_app_notifications" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_in_app_notifications_workspace_user_read" ON "in_app_notifications" ("workspace_id", "user_id", "read_at")`,
    );

    // ------------------------------------------------------------------
    // insight_cards
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "insight_cards_severity_enum" AS ENUM ('positive', 'warning', 'critical', 'neutral')
    `);
    await queryRunner.query(`
      CREATE TABLE "insight_cards" (
        "id"           uuid                             NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid                             NOT NULL,
        "type"         text                             NOT NULL,
        "severity"     "insight_cards_severity_enum"    NOT NULL DEFAULT 'neutral',
        "title"        text                             NOT NULL,
        "body"         text                             NOT NULL,
        "payload"      jsonb                            NOT NULL DEFAULT '{}',
        "created_at"   TIMESTAMP                        NOT NULL DEFAULT now(),
        "expires_at"   TIMESTAMP,
        CONSTRAINT "PK_insight_cards" PRIMARY KEY ("id"),
        CONSTRAINT "FK_insight_cards_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_insight_cards_workspace_id" ON "insight_cards" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_insight_cards_expires_at" ON "insight_cards" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "insight_cards"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "insight_cards_severity_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "in_app_notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "alert_rules"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "alert_rules_time_window_enum"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "alert_rules_operator_enum"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "alert_rules_metric_family_enum"`);
  }
}
