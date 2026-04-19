import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessions1000000000001 implements MigrationInterface {
  name = 'AddSessions1000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id"          uuid    NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"     uuid    NOT NULL,
        "token_hash"  text    NOT NULL,
        "expires_at"  TIMESTAMP NOT NULL,
        "created_at"  TIMESTAMP NOT NULL DEFAULT now(),
        "revoked_at"  TIMESTAMP,
        "user_agent"  text    NOT NULL,
        "ip"          text    NOT NULL,
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sessions_user_id"
          FOREIGN KEY ("user_id")
          REFERENCES "users" ("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_user_id"  ON "sessions" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_expires_at" ON "sessions" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sessions"`);
  }
}
