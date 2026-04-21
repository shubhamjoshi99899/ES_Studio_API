import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentPostProfiles1000000000005 implements MigrationInterface {
  name = 'AddContentPostProfiles1000000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "content_post_profiles" (
        "id"         uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "post_id"    uuid      NOT NULL,
        "profile_id" uuid      NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_content_post_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_content_post_profiles_post_profile" UNIQUE ("post_id", "profile_id"),
        CONSTRAINT "FK_content_post_profiles_post_id"
          FOREIGN KEY ("post_id")    REFERENCES "content_posts"   ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_content_post_profiles_profile_id"
          FOREIGN KEY ("profile_id") REFERENCES "social_profiles" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_content_post_profiles_post_id"    ON "content_post_profiles" ("post_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_content_post_profiles_profile_id" ON "content_post_profiles" ("profile_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_content_post_profiles_profile_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_content_post_profiles_post_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "content_post_profiles"`);
  }
}
