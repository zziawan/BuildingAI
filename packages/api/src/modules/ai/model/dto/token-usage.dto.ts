import { Transform, Type } from "class-transformer";
import { IsDate, IsInt, IsOptional, IsString, Min } from "class-validator";

/**
 * Token用量记录DTO
 */
export class TokenUsageDto {
    /**
     * 请求ID
     */
    @IsOptional()
    @IsString({ message: "request_id 必须是字符串" })
    request_id?: string;

    /**
     * 聊天记录ID
     */
    @IsOptional()
    @IsString({ message: "chat_id 必须是字符串" })
    chat_id?: string;

    /**
     * 会话ID
     */
    @IsOptional()
    @IsString({ message: "session_id 必须是字符串" })
    session_id?: string;

    /**
     * 用户ID
     */
    @IsOptional()
    @IsString({ message: "user_id 必须是字符串" })
    user_id?: string;

    /**
     * API Key ID
     */
    @IsOptional()
    @IsString({ message: "api_key_id 必须是字符串" })
    api_key_id?: string;

    /**
     * 供应商名称
     */
    @IsOptional()
    @IsString({ message: "provider 必须是字符串" })
    provider_id?: string;

    /**
     * 模型名称
     */
    @IsOptional()
    @IsString({ message: "model 必须是字符串" })
    model_id?: string;

    /**
     * 输入 token 数量
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "prompt_tokens 必须是整数" })
    @Min(0, { message: "prompt_tokens 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    prompt_tokens?: number = 0;

    /**
     * 输出 token 数量
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "completion_tokens 必须是整数" })
    @Min(0, { message: "completion_tokens 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    completion_tokens?: number = 0;

    /**
     * 总 token 数量
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "total_tokens 必须是整数" })
    @Min(0, { message: "total_tokens 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    total_tokens?: number = 0;

    /**
     * 缓存 token 数量
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "cached_tokens 必须是整数" })
    @Min(0, { message: "cached_tokens 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    cached_tokens?: number = 0;

    /**
     * 推理 token 数量
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "reasoning_tokens 必须是整数" })
    @Min(0, { message: "reasoning_tokens 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    reasoning_tokens?: number = 0;

    /**
     * 音频 token 数量
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "audio_tokens 必须是整数" })
    @Min(0, { message: "audio_tokens 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    audio_tokens?: number = 0;

    /**
     * 图片生成数量
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "images 必须是整数" })
    @Min(0, { message: "images 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    images?: number = 0;

    /**
     * 输入token消费金额
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "prompt_cost 必须是整数" })
    @Min(0, { message: "prompt_cost 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    prompt_cost?: number = 0;

    /**
     * 输出token消费金额
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "completion_cost 必须是整数" })
    @Min(0, { message: "completion_cost 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    completion_cost?: number = 0;

    /**
     * 缓存token消费金额
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "cached_cost 必须是整数" })
    @Min(0, { message: "cached_cost 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    cached_cost?: number = 0;

    /**
     * 推理token消费金额
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "reasoning_cost 必须是整数" })
    @Min(0, { message: "reasoning_cost 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    reasoning_cost?: number = 0;

    /**
     * 音频token消费金额
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "audio_cost 必须是整数" })
    @Min(0, { message: "audio_cost 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    audio_cost?: number = 0;

    /**
     * 图片消费金额
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "images_cost 必须是整数" })
    @Min(0, { message: "images_cost 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    images_cost?: number = 0;
    /**
     * 总消费金额以上各种费用的总和
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "total_cost 必须是整数" })
    @Min(0, { message: "total_cost 不能小于 0" })
    @Transform(({ value }) => (value !== undefined ? value : 0))
    total_cost?: number = 0;
    /**
     * 请求状态
     */
    @IsOptional()
    @IsString({ message: "status 必须是字符串" })
    status?: string;

    /**
     * 创建时间
     */
    @IsOptional()
    @Type(() => Date)
    @IsDate({ message: "created_at 必须是日期" })
    created_at?: Date;
}
