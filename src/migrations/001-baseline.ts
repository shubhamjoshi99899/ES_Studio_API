import { MigrationInterface, QueryRunner } from 'typeorm';

export class Baseline1000000000000 implements MigrationInterface {
  name = 'Baseline1000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // users
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"           uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "email"        character varying NOT NULL,
        "passwordHash" character varying NOT NULL,
        "apiKey"       character varying,
        "createdAt"    TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email"   UNIQUE ("email"),
        CONSTRAINT "UQ_users_apiKey"  UNIQUE ("apiKey"),
        CONSTRAINT "PK_users"         PRIMARY KEY ("id")
      )
    `);

    // ------------------------------------------------------------------
    // social_profiles
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "social_profiles" (
        "id"            uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "profileId"     character varying NOT NULL,
        "name"          character varying NOT NULL,
        "platform"      character varying NOT NULL,
        "accessToken"   character varying NOT NULL,
        "isActive"      boolean           NOT NULL DEFAULT true,
        "syncState"     character varying NOT NULL DEFAULT 'COMPLETED',
        "lastSyncError" text,
        CONSTRAINT "UQ_social_profiles_profileId" UNIQUE ("profileId"),
        CONSTRAINT "PK_social_profiles"           PRIMARY KEY ("id")
      )
    `);

    // ------------------------------------------------------------------
    // analytics_snapshots
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "analytics_snapshots" (
        "id"               uuid    NOT NULL DEFAULT uuid_generate_v4(),
        "profileId"        character varying NOT NULL,
        "date"             date    NOT NULL,
        "platform"         character varying NOT NULL,
        "totalFollowers"   integer NOT NULL DEFAULT 0,
        "followersGained"  integer NOT NULL DEFAULT 0,
        "unfollows"        integer NOT NULL DEFAULT 0,
        "totalReach"       integer NOT NULL DEFAULT 0,
        "totalImpressions" integer NOT NULL DEFAULT 0,
        "videoViews"       integer NOT NULL DEFAULT 0,
        "totalEngagement"  integer NOT NULL DEFAULT 0,
        "profileClicks"    integer NOT NULL DEFAULT 0,
        "pageViews"        integer NOT NULL DEFAULT 0,
        "netMessages"      integer NOT NULL DEFAULT 0,
        "revenue"          numeric(10,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_analytics_snapshots" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_analytics_snapshots_profileId_date"
        ON "analytics_snapshots" ("profileId", "date")
    `);

    // ------------------------------------------------------------------
    // demographic_snapshots
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "demographic_snapshots" (
        "id"           uuid    NOT NULL DEFAULT uuid_generate_v4(),
        "profileId"    character varying NOT NULL,
        "date"         date    NOT NULL,
        "platform"     character varying NOT NULL,
        "genderAge"    jsonb   NOT NULL DEFAULT '{}',
        "topCities"    jsonb   NOT NULL DEFAULT '{}',
        "topCountries" jsonb   NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_demographic_snapshots" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_demographic_snapshots_profileId_date"
        ON "demographic_snapshots" ("profileId", "date")
    `);

    // ------------------------------------------------------------------
    // social_posts
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "social_posts" (
        "postId"       character varying NOT NULL,
        "profileId"    character varying NOT NULL,
        "platform"     character varying NOT NULL,
        "postType"     character varying,
        "message"      text,
        "mediaUrl"     text,
        "thumbnailUrl" text,
        "permalink"    text,
        "postedAt"     TIMESTAMP         NOT NULL,
        "isPublished"  boolean           NOT NULL DEFAULT true,
        "isBoosted"    boolean           NOT NULL DEFAULT false,
        "authorName"   character varying,
        "likes"        integer           NOT NULL DEFAULT 0,
        "comments"     integer           NOT NULL DEFAULT 0,
        "shares"       integer           NOT NULL DEFAULT 0,
        "reach"        integer           NOT NULL DEFAULT 0,
        "views"        integer           NOT NULL DEFAULT 0,
        "clicks"       integer           NOT NULL DEFAULT 0,
        "createdAt"    TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_social_posts" PRIMARY KEY ("postId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_social_posts_profileId_postedAt"
        ON "social_posts" ("profileId", "postedAt")
    `);

    // ------------------------------------------------------------------
    // daily_revenue
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "daily_revenue" (
        "id"           SERIAL,
        "pageId"       character varying NOT NULL,
        "date"         date              NOT NULL,
        "bonusRevenue" numeric(10,2)     NOT NULL DEFAULT 0,
        "photoRevenue" numeric(10,2)     NOT NULL DEFAULT 0,
        "reelRevenue"  numeric(10,2)     NOT NULL DEFAULT 0,
        "storyRevenue" numeric(10,2)     NOT NULL DEFAULT 0,
        "textRevenue"  numeric(10,2)     NOT NULL DEFAULT 0,
        "totalRevenue" numeric(10,2)     NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_daily_revenue_pageId_date" UNIQUE ("pageId", "date"),
        CONSTRAINT "PK_daily_revenue" PRIMARY KEY ("id")
      )
    `);

    // ------------------------------------------------------------------
    // revenue_mappings
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "revenue_mappings" (
        "id"        SERIAL,
        "pageId"    character varying NOT NULL,
        "pageName"  character varying NOT NULL,
        "team"      character varying,
        "createdAt" TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_revenue_mappings_pageId" UNIQUE ("pageId"),
        CONSTRAINT "PK_revenue_mappings"        PRIMARY KEY ("id")
      )
    `);

    // ------------------------------------------------------------------
    // page_mappings
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "page_mappings" (
        "id"         SERIAL,
        "category"   character varying NOT NULL,
        "team"       character varying DEFAULT NULL,
        "platform"   character varying NOT NULL,
        "pageName"   character varying NOT NULL,
        "utmSource"  character varying NOT NULL,
        "utmMediums" text[]            NOT NULL,
        CONSTRAINT "PK_page_mappings" PRIMARY KEY ("id")
      )
    `);

    // ------------------------------------------------------------------
    // report_recipients
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "report_recipients" (
        "id"        SERIAL,
        "email"     character varying NOT NULL,
        "isActive"  boolean           NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_report_recipients_email" UNIQUE ("email"),
        CONSTRAINT "PK_report_recipients"       PRIMARY KEY ("id")
      )
    `);

    // ------------------------------------------------------------------
    // daily_analytics
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "daily_analytics" (
        "id"               SERIAL,
        "dimensionHash"    character varying NOT NULL,
        "date"             date              NOT NULL,
        "utmSource"        character varying NOT NULL DEFAULT '(direct)',
        "utmMedium"        character varying NOT NULL DEFAULT '(none)',
        "utmCampaign"      character varying NOT NULL DEFAULT '(not set)',
        "country"          character varying,
        "city"             character varying,
        "deviceCategory"   character varying,
        "userGender"       character varying,
        "userAge"          character varying,
        "sessions"         integer           NOT NULL DEFAULT 0,
        "pageviews"        integer           NOT NULL DEFAULT 0,
        "users"            integer           NOT NULL DEFAULT 0,
        "newUsers"         integer           NOT NULL DEFAULT 0,
        "recurringUsers"   integer           NOT NULL DEFAULT 0,
        "identifiedUsers"  integer           NOT NULL DEFAULT 0,
        "eventCount"       integer           NOT NULL DEFAULT 0,
        "engagementRate"   numeric(5,4)      NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_daily_analytics_dimensionHash" UNIQUE ("dimensionHash"),
        CONSTRAINT "PK_daily_analytics" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_daily_analytics_date_utmSource_utmMedium"
        ON "daily_analytics" ("date", "utmSource", "utmMedium")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_daily_analytics_date" ON "daily_analytics" ("date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_daily_analytics_utmMedium" ON "daily_analytics" ("utmMedium")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_analytics"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "report_recipients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "page_mappings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "revenue_mappings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_revenue"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "social_posts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "demographic_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "social_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
