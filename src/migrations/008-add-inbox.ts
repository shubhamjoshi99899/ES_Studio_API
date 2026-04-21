import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInbox1000000000007 implements MigrationInterface {
  name = 'AddInbox1000000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Shared platform enum ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "inbox_platform_enum" AS ENUM ('facebook', 'instagram', 'linkedin', 'tiktok')
    `);

    // ── inbox_contacts ─────────────────────────────────────────────────────
    // Created before inbox_threads because inbox_threads.contact_id FK points here.
    await queryRunner.query(`
      CREATE TABLE "inbox_contacts" (
        "id"           uuid                    NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid                    NOT NULL,
        "platform"     "inbox_platform_enum"   NOT NULL,
        "external_id"  text                    NOT NULL,
        "name"         text,
        "avatar_url"   text,
        "metadata"     jsonb                   NOT NULL DEFAULT '{}',
        "created_at"   TIMESTAMP               NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP               NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inbox_contacts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inbox_contacts_workspace_platform_external_id"
          UNIQUE ("workspace_id", "platform", "external_id"),
        CONSTRAINT "FK_inbox_contacts_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_inbox_contacts_workspace_id" ON "inbox_contacts" ("workspace_id")`,
    );

    // ── Enums for inbox_threads / inbox_messages ───────────────────────────
    await queryRunner.query(`
      CREATE TYPE "inbox_thread_status_enum" AS ENUM ('open', 'pending', 'resolved', 'snoozed')
    `);
    await queryRunner.query(`
      CREATE TYPE "inbox_message_direction_enum" AS ENUM ('inbound', 'outbound')
    `);

    // ── platform_connections ───────────────────────────────────────────────
    // Workspace-scoped OAuth connections; polling worker reads credentials here.
    await queryRunner.query(`
      CREATE TYPE "platform_connection_status_enum" AS ENUM ('active', 'error', 'disconnected')
    `);
    await queryRunner.query(`
      CREATE TABLE "platform_connections" (
        "id"                  uuid                               NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id"        uuid                               NOT NULL,
        "platform"            "inbox_platform_enum"              NOT NULL,
        "external_profile_id" text                               NOT NULL,
        "access_token"        text                               NOT NULL,
        "status"              "platform_connection_status_enum"  NOT NULL DEFAULT 'active',
        "last_synced_at"      TIMESTAMP,
        "created_at"          TIMESTAMP                          NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP                          NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_connections" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_platform_connections_workspace_platform_profile"
          UNIQUE ("workspace_id", "platform", "external_profile_id"),
        CONSTRAINT "FK_platform_connections_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_platform_connections_workspace_id" ON "platform_connections" ("workspace_id")`,
    );

    // ── inbox_threads ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "inbox_threads" (
        "id"                  uuid                        NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id"        uuid                        NOT NULL,
        "platform"            "inbox_platform_enum"       NOT NULL,
        "external_thread_id"  text                        NOT NULL,
        "external_profile_id" text                        NOT NULL,
        "contact_id"          uuid,
        "assigned_to"         uuid,
        "status"              "inbox_thread_status_enum"  NOT NULL DEFAULT 'open',
        "last_message_at"     TIMESTAMP                   NOT NULL DEFAULT now(),
        "created_at"          TIMESTAMP                   NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP                   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inbox_threads" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inbox_threads_workspace_platform_external_thread"
          UNIQUE ("workspace_id", "platform", "external_thread_id"),
        CONSTRAINT "FK_inbox_threads_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inbox_threads_contact_id"
          FOREIGN KEY ("contact_id") REFERENCES "inbox_contacts" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_inbox_threads_assigned_to"
          FOREIGN KEY ("assigned_to") REFERENCES "workspace_users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_inbox_threads_workspace_id" ON "inbox_threads" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_inbox_threads_workspace_status_last_msg" ON "inbox_threads" ("workspace_id", "status", "last_message_at" DESC)`,
    );

    // ── inbox_messages ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "inbox_messages" (
        "id"                  uuid                             NOT NULL DEFAULT uuid_generate_v4(),
        "thread_id"           uuid                             NOT NULL,
        "workspace_id"        uuid                             NOT NULL,
        "external_message_id" text                             NOT NULL,
        "direction"           "inbox_message_direction_enum"   NOT NULL,
        "body"                text                             NOT NULL,
        "media_urls"          text[],
        "sender_external_id"  text                             NOT NULL,
        "sender_name"         text,
        "read_at"             TIMESTAMP,
        "created_at"          TIMESTAMP                        NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inbox_messages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inbox_messages_thread_external_message_id"
          UNIQUE ("thread_id", "external_message_id"),
        CONSTRAINT "FK_inbox_messages_thread_id"
          FOREIGN KEY ("thread_id") REFERENCES "inbox_threads" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inbox_messages_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_inbox_messages_workspace_id" ON "inbox_messages" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_inbox_messages_thread_created_at" ON "inbox_messages" ("thread_id", "created_at" DESC)`,
    );

    // ── inbox_notes ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "inbox_notes" (
        "id"           uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "thread_id"    uuid      NOT NULL,
        "workspace_id" uuid      NOT NULL,
        "author_id"    uuid      NOT NULL,
        "body"         text      NOT NULL,
        "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inbox_notes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inbox_notes_thread_id"
          FOREIGN KEY ("thread_id")    REFERENCES "inbox_threads"   ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inbox_notes_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces"      ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inbox_notes_author_id"
          FOREIGN KEY ("author_id")    REFERENCES "workspace_users"  ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_inbox_notes_workspace_id" ON "inbox_notes" ("workspace_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "inbox_notes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inbox_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inbox_threads"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "platform_connections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inbox_contacts"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "platform_connection_status_enum"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "inbox_thread_status_enum"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "inbox_message_direction_enum"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "inbox_platform_enum"`);
  }
}
