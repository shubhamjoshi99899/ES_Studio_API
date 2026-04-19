import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkspaces1000000000002 implements MigrationInterface {
  name = 'AddWorkspaces1000000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // workspaces
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "workspace_plan_enum" AS ENUM ('starter', 'pro', 'enterprise')
    `);

    await queryRunner.query(`
      CREATE TABLE "workspaces" (
        "id"         uuid                      NOT NULL DEFAULT uuid_generate_v4(),
        "name"       character varying         NOT NULL,
        "slug"       character varying         NOT NULL,
        "plan"       "workspace_plan_enum"     NOT NULL DEFAULT 'starter',
        "created_at" TIMESTAMP                 NOT NULL DEFAULT now(),
        "settings"   jsonb                     NOT NULL DEFAULT '{}',
        CONSTRAINT "UQ_workspaces_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_workspaces"      PRIMARY KEY ("id")
      )
    `);

    // ------------------------------------------------------------------
    // workspace_users
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "workspace_user_role_enum"   AS ENUM ('admin', 'analyst', 'content_manager')
    `);
    await queryRunner.query(`
      CREATE TYPE "workspace_user_status_enum" AS ENUM ('invited', 'active', 'suspended')
    `);

    await queryRunner.query(`
      CREATE TABLE "workspace_users" (
        "id"           uuid                           NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid                           NOT NULL,
        "user_id"      uuid                           NOT NULL,
        "role"         "workspace_user_role_enum"     NOT NULL DEFAULT 'analyst',
        "status"       "workspace_user_status_enum"   NOT NULL DEFAULT 'invited',
        "invited_by"   uuid,
        "invited_at"   TIMESTAMP                      NOT NULL DEFAULT now(),
        "accepted_at"  TIMESTAMP,
        CONSTRAINT "PK_workspace_users" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_users_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_workspace_users_user_id"
          FOREIGN KEY ("user_id")      REFERENCES "users" ("id")      ON DELETE CASCADE,
        CONSTRAINT "FK_workspace_users_invited_by"
          FOREIGN KEY ("invited_by")   REFERENCES "users" ("id")      ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_workspace_users_workspace_id" ON "workspace_users" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_workspace_users_user_id" ON "workspace_users" ("user_id")
    `);

    // ------------------------------------------------------------------
    // workspace_invites
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "workspace_invite_role_enum" AS ENUM ('admin', 'analyst', 'content_manager')
    `);

    await queryRunner.query(`
      CREATE TABLE "workspace_invites" (
        "id"           uuid                           NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid                           NOT NULL,
        "email"        character varying              NOT NULL,
        "role"         "workspace_invite_role_enum"   NOT NULL DEFAULT 'analyst',
        "token"        text                           NOT NULL,
        "expires_at"   TIMESTAMP                      NOT NULL,
        "accepted_at"  TIMESTAMP,
        CONSTRAINT "UQ_workspace_invites_token" UNIQUE ("token"),
        CONSTRAINT "PK_workspace_invites"       PRIMARY KEY ("id"),
        CONSTRAINT "FK_workspace_invites_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_workspace_invites_workspace_id" ON "workspace_invites" ("workspace_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_invites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspaces"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_invite_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_user_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_user_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_plan_enum"`);
  }
}
