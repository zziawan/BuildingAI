import { AppEntity } from "../decorators/app-entity.decorator";
import { Column, Index } from "../typeorm";
import { BaseEntity } from "./base";

/**
 * Token用量记录实体
 *
 * 记录每次 AI 模型调用的详细 Token 用量和费用分解
 * 通过 request_id 与 AccountLog.associationNo 关联
 */
@AppEntity({
    name: "ai_token_usage",
    comment: "Token用量记录",
})
@Index(["request_id"])
@Index(["chat_id"])
@Index(["user_id"])
@Index(["session_id"])
export class TokenUsage extends BaseEntity {
    /**
     * 请求ID（关联 AccountLog.associationNo）
     */
    @Column({
        type: "varchar",
        length: 64,
        nullable: true,
        comment: "请求ID",
    })
    request_id: string;

    /**
     * 聊天记录ID
     */
    @Column({
        type: "varchar",
        length: 64,
        nullable: true,
        comment: "聊天记录ID",
    })
    chat_id: string;

    /**
     * 会话ID
     */
    @Column({
        type: "varchar",
        length: 64,
        nullable: true,
        comment: "会话ID",
    })
    session_id: string;

    /**
     * 用户ID
     */
    @Column({
        type: "uuid",
        nullable: true,
        comment: "用户ID",
    })
    user_id: string;

    /**
     * API Key ID
     */
    @Column({
        type: "uuid",
        nullable: true,
        comment: "API Key ID",
    })
    api_key_id: string;

    /**
     * 供应商名称
     */
    @Column({
        type: "varchar",
        length: 100,
        nullable: true,
        comment: "供应商标识",
    })
    provider_id: string;

    /**
     * 模型名称
     */
    @Column({
        type: "varchar",
        length: 100,
        nullable: true,
        comment: "模型标识",
    })
    model_id: string;

    /**
     * 输入 Token 数量
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "输入 Token 数量",
    })
    prompt_tokens: number;

    /**
     * 输出 Token 数量
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "输出 Token 数量",
    })
    completion_tokens: number;

    /**
     * 总 Token 数量
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "总 Token 数量",
    })
    total_tokens: number;

    /**
     * 缓存 Token 数量
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "缓存 Token 数量",
    })
    cached_tokens: number;

    /**
     * 推理 Token 数量
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "推理 Token 数量",
    })
    reasoning_tokens: number;

    /**
     * 音频 Token 数量
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "音频 Token 数量",
    })
    audio_tokens: number;

    /**
     * 图片生成数量
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "图片生成数量",
    })
    images: number;

    /**
     * 输入 Token 消费金额
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "输入 Token 消费金额",
    })
    prompt_cost: number;

    /**
     * 输出 Token 消费金额
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "输出 Token 消费金额",
    })
    completion_cost: number;

    /**
     * 缓存 Token 消费金额
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "缓存 Token 消费金额",
    })
    cached_cost: number;

    /**
     * 推理 Token 消费金额
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "推理 Token 消费金额",
    })
    reasoning_cost: number;

    /**
     * 音频 Token 消费金额
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "音频 Token 消费金额",
    })
    audio_cost: number;

    /**
     * 图片消费金额
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "图片消费金额",
    })
    images_cost: number;

    /**
     * 总消费金额（各维度费用之和）
     */
    @Column({
        type: "integer",
        default: 0,
        comment: "总消费金额",
    })
    total_cost: number;

    /**
     * 请求延迟（毫秒）
     */
    @Column({
        type: "double precision",
        default: 0,
        comment: "请求延迟（毫秒）",
    })
    latency: number;

    /**
     * 请求状态
     */
    @Column({
        type: "varchar",
        length: 32,
        nullable: true,
        comment: "请求状态",
    })
    status: string;
}
