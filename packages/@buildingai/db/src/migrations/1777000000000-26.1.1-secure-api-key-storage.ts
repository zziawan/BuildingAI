import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration2611SecureApiKeyStorage1777000000000 implements MigrationInterface {
    name = "Migration2611SecureApiKeyStorage1777000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await queryRunner.query(`ALTER TABLE "api_key" RENAME COLUMN "key" TO "key_hash"`);
        await queryRunner.query(`ALTER TABLE "api_key" ADD COLUMN "key_prefix" character varying`);
        await queryRunner.query(`ALTER TABLE "api_key" ADD COLUMN "key_suffix" character varying`);
        await queryRunner.query(`ALTER TABLE "api_key" DROP CONSTRAINT IF EXISTS "UQ_2e2eb3a1c3b5685d8e1c4d4e8e2"`);
        await queryRunner.query(
            `UPDATE "api_key"
             SET "key_prefix" = LEFT("key_hash", 8),
                 "key_suffix" = RIGHT("key_hash", 8),
                 "key_hash" = ENCODE(DIGEST("key_hash", 'sha256'), 'hex')`,
        );
        await queryRunner.query(`ALTER TABLE "api_key" ALTER COLUMN "key_prefix" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "api_key" ALTER COLUMN "key_suffix" SET NOT NULL`);
        await queryRunner.query(
            `ALTER TABLE "api_key" ADD CONSTRAINT "UQ_api_key_key_hash" UNIQUE ("key_hash")`,
        );
        await queryRunner.query(`COMMENT ON COLUMN "api_key"."key_hash" IS 'API Key 摘要值'`);
        await queryRunner.query(`COMMENT ON COLUMN "api_key"."key_prefix" IS 'API Key 前缀'`);
        await queryRunner.query(`COMMENT ON COLUMN "api_key"."key_suffix" IS 'API Key 后缀'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "api_key" DROP CONSTRAINT IF EXISTS "UQ_api_key_key_hash"`);
        await queryRunner.query(
            `ALTER TABLE "api_key" ADD CONSTRAINT "UQ_2e2eb3a1c3b5685d8e1c4d4e8e2" UNIQUE ("key_hash")`,
        );
        await queryRunner.query(`ALTER TABLE "api_key" DROP COLUMN "key_suffix"`);
        await queryRunner.query(`ALTER TABLE "api_key" DROP COLUMN "key_prefix"`);
        await queryRunner.query(`ALTER TABLE "api_key" RENAME COLUMN "key_hash" TO "key"`);
        await queryRunner.query(`COMMENT ON COLUMN "api_key"."key" IS 'API Key 值'`);
    }
}