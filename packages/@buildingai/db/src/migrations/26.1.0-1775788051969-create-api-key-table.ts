import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration2611775788051969 implements MigrationInterface {
    name = "Migration2611775788051969";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "api_key" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying NOT NULL, "key" character varying NOT NULL, "user_id" uuid NOT NULL, "last_used_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2e2eb3a1c3b5685d8e1c4d4e8e1" PRIMARY KEY ("id"), CONSTRAINT "UQ_2e2eb3a1c3b5685d8e1c4d4e8e2" UNIQUE ("key"))`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_2e2eb3a1c3b5685d8e1c4d4e8e1" ON "api_key" ("id") `,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_2e2eb3a1c3b5685d8e1c4d4e8e3" ON "api_key" ("user_id") `,
        );
        await queryRunner.query(`COMMENT ON TABLE "api_key" IS 'API Key 信息'`);
        await queryRunner.query(`COMMENT ON COLUMN "api_key"."name" IS 'API Key 名称'`);
        await queryRunner.query(`COMMENT ON COLUMN "api_key"."key" IS 'API Key 值'`);
        await queryRunner.query(`COMMENT ON COLUMN "api_key"."user_id" IS '用户 ID'`);
        await queryRunner.query(`COMMENT ON COLUMN "api_key"."last_used_at" IS '最近使用时间'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "api_key"`);
    }
}
