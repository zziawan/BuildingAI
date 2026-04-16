import { AppEntity } from "../decorators/app-entity.decorator";
import { Column } from "../typeorm";
import { SoftDeleteBaseEntity } from "./base";

/**
 * API Key 实体
 *
 * 定义系统中的 API Key 及其关联信息
 */
@AppEntity({ name: "api_key", comment: "API Key 信息" })
export class ApiKey extends SoftDeleteBaseEntity {
    /**
     * API Key 名称
     */
    @Column({ comment: "API Key 名称" })
    name: string;

    /**
     * API Key 摘要值
     */
    @Column({ unique: true, comment: "API Key 摘要值" })
    keyHash: string;

    /**
     * API Key 前缀
     */
    @Column({ comment: "API Key 前缀" })
    keyPrefix: string;

    /**
     * API Key 后缀
     */
    @Column({ comment: "API Key 后缀" })
    keySuffix: string;

    /**
     * 用户 ID
     */
    @Column({ type: "uuid", comment: "用户 ID" })
    userId: string;

    /**
     * 最近使用时间
     */
    @Column({ nullable: true, comment: "最近使用时间" })
    lastUsedAt: Date;
}