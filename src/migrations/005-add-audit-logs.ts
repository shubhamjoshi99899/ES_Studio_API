import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogs1000000000004 implements MigrationInterface {
  name = 'AddAuditLogs1000000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"          uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid             NOT NULL,
        "actor_id"    uuid,
        "action"      text              NOT NULL,
        "entity_type" text              NOT NULL,
        "entity_id"   uuid,
        "payload"     jsonb             NOT NULL DEFAULT '{}',
        "created_at"  TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_workspace_id"
          FOREIGN KEY ("workspace_id") REFERENCES "workspaces"     ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_audit_logs_actor_id"
          FOREIGN KEY ("actor_id")     REFERENCES "workspace_users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_workspace_id" ON "audit_logs" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
