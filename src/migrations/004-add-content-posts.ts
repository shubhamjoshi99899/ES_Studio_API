import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentPosts1000000000003 implements MigrationInterface {
  name = 'AddContentPosts1000000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // campaigns (must precede content_posts — content_posts FK→campaigns)
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "campaign_status_enum" AS ENUM ('draft', 'active', 'completed')
    `);

    await queryRunner.query(`
      CREATE TABLE "campaigns" (
        "id"           uuid                   NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid                   NOT NULL,
        "name"         character varying      NOT NULL,
        "objective"    character varying      NOT NULL,
        "status"       "campaign_status_enum" NOT NULL DEFAULT 'draft',
        "platforms"    text[]                 NOT NULL DEFAULT '{}',
        "budget"       numeric,
        "spend"        numeric                NOT NULL DEFAULT 0,
        "start_date"   date                   NOT NULL,
        "end_date"     date,
        "created_at"   TIMESTAMP              NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaigns" PRIMARY KEY ("id"),
        CONSTRAINT "FK_campaigns_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaigns_workspace_id" ON "campaigns" ("workspace_id")`,
    );

    // ------------------------------------------------------------------
    // content_posts
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "content_post_status_enum" AS ENUM (
        'draft', 'review', 'approved', 'scheduled', 'published', 'failed'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "content_posts" (
        "id"             uuid                       NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id"   uuid                       NOT NULL,
        "title"          character varying          NOT NULL,
        "caption"        text                       NOT NULL DEFAULT '',
        "hashtags"       text[]                     NOT NULL DEFAULT '{}',
        "platforms"      text[]                     NOT NULL DEFAULT '{}',
        "media_type"     character varying          NOT NULL DEFAULT '',
        "owner_id"       uuid                       NOT NULL,
        "approval_owner" uuid,
        "campaign_id"    uuid,
        "scheduled_at"   TIMESTAMP,
        "status"         "content_post_status_enum" NOT NULL DEFAULT 'draft',
        "created_at"     TIMESTAMP                  NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP                  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_content_posts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_content_posts_workspace_id"
          FOREIGN KEY ("workspace_id")   REFERENCES "workspaces"     ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_content_posts_owner_id"
          FOREIGN KEY ("owner_id")       REFERENCES "workspace_users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_content_posts_approval_owner"
          FOREIGN KEY ("approval_owner") REFERENCES "workspace_users" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_content_posts_campaign_id"
          FOREIGN KEY ("campaign_id")    REFERENCES "campaigns"       ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_content_posts_workspace_id" ON "content_posts" ("workspace_id")`,
    );

    // ------------------------------------------------------------------
    // content_post_approvals
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "post_approval_action_enum" AS ENUM (
        'approved', 'rejected', 'requested_changes'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "content_post_approvals" (
        "id"          uuid                        NOT NULL DEFAULT uuid_generate_v4(),
        "post_id"     uuid                        NOT NULL,
        "reviewer_id" uuid                        NOT NULL,
        "action"      "post_approval_action_enum" NOT NULL,
        "note"        text                        NOT NULL DEFAULT '',
        "created_at"  TIMESTAMP                   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_content_post_approvals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_content_post_approvals_post_id"
          FOREIGN KEY ("post_id")     REFERENCES "content_posts"    ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_content_post_approvals_reviewer_id"
          FOREIGN KEY ("reviewer_id") REFERENCES "workspace_users"  ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_content_post_approvals_post_id" ON "content_post_approvals" ("post_id")`,
    );

    // ------------------------------------------------------------------
    // content_publish_attempts
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "content_publish_attempts" (
        "id"           uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "post_id"      uuid              NOT NULL,
        "attempted_at" TIMESTAMP         NOT NULL DEFAULT now(),
        "status"       character varying NOT NULL,
        "error"        text,
        "external_id"  text,
        CONSTRAINT "PK_content_publish_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_content_publish_attempts_post_id"
          FOREIGN KEY ("post_id") REFERENCES "content_posts" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_content_publish_attempts_post_id" ON "content_publish_attempts" ("post_id")`,
    );

    // ------------------------------------------------------------------
    // campaign_post_links
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "campaign_post_links" (
        "campaign_id" uuid NOT NULL,
        "post_id"     uuid NOT NULL,
        CONSTRAINT "PK_campaign_post_links" PRIMARY KEY ("campaign_id", "post_id"),
        CONSTRAINT "FK_campaign_post_links_campaign_id"
          FOREIGN KEY ("campaign_id") REFERENCES "campaigns"     ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_campaign_post_links_post_id"
          FOREIGN KEY ("post_id")     REFERENCES "content_posts" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_campaign_post_links_campaign_id" ON "campaign_post_links" ("campaign_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_post_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "content_publish_attempts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "content_post_approvals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "content_posts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "post_approval_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "content_post_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "campaign_status_enum"`);
  }
}
