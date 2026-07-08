import { BaseService } from "@buildingai/base";
import {
    ACCOUNT_LOG_SOURCE,
    ACCOUNT_LOG_TYPE,
} from "@buildingai/constants/shared/account-log.constants";
import { AppBillingService } from "@buildingai/core/modules";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { TokenUsage } from "@buildingai/db/entities";
import { FindOptionsWhere, Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import { TokenUsageDto } from "@modules/ai/model/dto/token-usage.dto";
import { Injectable } from "@nestjs/common";

/**
 * Token用量记录服务
 *
 * 提供 Token 用量记录的创建、查询和删除功能。
 * 创建记录时自动调用积分扣费服务，生成对应的 AccountLog 账单记录，
 * 通过 request_id ↔ associationNo 实现双向关联。
 */
@Injectable()
export class TokenUsageService extends BaseService<TokenUsage> {
    constructor(
        @InjectRepository(TokenUsage)
        private readonly tokenUsageRepository: Repository<TokenUsage>,
        private readonly appBillingService: AppBillingService,
    ) {
        super(tokenUsageRepository);
    }

    /**
     * 计算总消费金额（各维度费用之和）
     */
    private calcTotalCost(dto: TokenUsageDto): number {
        return (
            (dto.prompt_cost ?? 0) +
            (dto.completion_cost ?? 0) +
            (dto.cached_cost ?? 0) +
            (dto.reasoning_cost ?? 0) +
            (dto.audio_cost ?? 0) +
            (dto.images_cost ?? 0)
        );
    }

    /**
     * 创建 Token 用量记录（含积分扣费）
     *
     * 1. 如果传入了 user_id 且 total_cost > 0，先调用扣费服务扣减用户积分
     *    （扣费服务会自动创建 AccountLog 账单记录，associationNo = request_id）
     * 2. 然后创建 TokenUsage 记录保存用量明细
     *
     * @param dto Token用量数据
     * @returns 创建的 Token 用量记录
     */
    async createRecord(dto: TokenUsageDto): Promise<Partial<TokenUsage>> {
        try {
            // 计算各维度消费总额（若 dto.total_cost 未传则自动计算）
            const totalCost = dto.total_cost ?? this.calcTotalCost(dto);

            // 如果有用户且需要扣费，先执行积分扣费
            if (dto.user_id && totalCost > 0) {
                await this.appBillingService.deductUserPower({
                    userId: dto.user_id,
                    amount: totalCost,
                    accountType: ACCOUNT_LOG_TYPE.CHAT_DEC,
                    source: {
                        type: ACCOUNT_LOG_SOURCE.CHAT,
                        source: dto.model_id ? `${dto.provider_id ?? ""}/${dto.model_id}` : "AI模型调用",
                    },
                    remark: `prompt:${dto.prompt_tokens ?? 0} completion:${dto.completion_tokens ?? 0} total:${dto.total_tokens ?? 0}`,
                    associationNo: dto.request_id,
                });
            }

            // 确保 total_cost 已设置
            const recordData = {
                ...dto,
                total_cost: totalCost,
            };

            const result = await this.create(recordData as any);
            return result;
        } catch (error) {
            this.logger.error(`创建 Token 用量记录失败: ${error.message}`, error.stack);
            throw HttpErrorFactory.badRequest("Failed to create token usage record.");
        }
    }

    /**
     * 批量创建 Token 用量记录（含积分扣费）
     *
     * @param dtos Token用量数据数组
     * @returns 创建的 Token 用量记录列表
     */
    async createRecords(dtos: TokenUsageDto[]): Promise<Partial<TokenUsage>[]> {
        try {
            // 逐条扣费
            for (const dto of dtos) {
                const totalCost = dto.total_cost ?? this.calcTotalCost(dto);
                if (dto.user_id && totalCost > 0) {
                    await this.appBillingService.deductUserPower({
                        userId: dto.user_id,
                        amount: totalCost,
                        accountType: ACCOUNT_LOG_TYPE.CHAT_DEC,
                        source: {
                            type: ACCOUNT_LOG_SOURCE.CHAT,
                            source: dto.model_id
                                ? `${dto.provider_id ?? ""}/${dto.model_id}`
                                : "AI模型调用",
                        },
                        remark: `prompt:${dto.prompt_tokens ?? 0} completion:${dto.completion_tokens ?? 0} total:${dto.total_tokens ?? 0}`,
                        associationNo: dto.request_id,
                    });
                }
            }

            // 确保每条记录都有 total_cost
            const recordDataList = dtos.map((dto) => ({
                ...dto,
                total_cost: dto.total_cost ?? this.calcTotalCost(dto),
            }));

            const results = await this.createMany(recordDataList as any);
            return Array.isArray(results) ? results : [results];
        } catch (error) {
            this.logger.error(`批量创建 Token 用量记录失败: ${error.message}`, error.stack);
            throw HttpErrorFactory.badRequest("Failed to create token usage records.");
        }
    }

    /**
     * 根据 ID 查询 Token 用量记录
     *
     * @param id 记录ID
     * @param excludeFields 要排除的字段
     * @returns Token 用量记录
     */
    async findRecordById(id: string, excludeFields?: string[]): Promise<Partial<TokenUsage>> {
        try {
            const record = await this.findOneById(id, { excludeFields });
            if (!record) {
                throw HttpErrorFactory.notFound(`Token usage record ${id} not found.`);
            }
            return record;
        } catch (error) {
            this.logger.error(`查询 Token 用量记录失败: ${error.message}`, error.stack);
            throw HttpErrorFactory.badRequest("Failed to find token usage record.");
        }
    }

    /**
     * 查询所有 Token 用量记录
     *
     * @param excludeFields 要排除的字段
     * @returns Token 用量记录列表
     */
    async findAllRecords(excludeFields?: string[]): Promise<Partial<TokenUsage>[]> {
        try {
            const records = await this.findAll({
                order: { createdAt: "DESC" as any },
                excludeFields,
            });
            return records;
        } catch (error) {
            this.logger.error(`查询 Token 用量记录列表失败: ${error.message}`, error.stack);
            throw HttpErrorFactory.internal("Failed to find token usage records.");
        }
    }

    /**
     * 根据条件查询 Token 用量记录
     *
     * @param where 查询条件
     * @param excludeFields 要排除的字段
     * @returns Token 用量记录列表
     */
    async findRecordsByCondition(
        where: FindOptionsWhere<TokenUsage>,
        excludeFields?: string[],
    ): Promise<Partial<TokenUsage>[]> {
        try {
            const records = await this.findAll({
                where,
                order: { createdAt: "DESC" as any },
                excludeFields,
            });
            return records;
        } catch (error) {
            this.logger.error(`按条件查询 Token 用量记录失败: ${error.message}`, error.stack);
            throw HttpErrorFactory.internal("Failed to find token usage records by condition.");
        }
    }

    /**
     * 删除单条 Token 用量记录
     *
     * @param id 记录ID
     */
    async deleteRecord(id: string): Promise<void> {
        try {
            await this.delete(id);
        } catch (error) {
            this.logger.error(`删除 Token 用量记录失败: ${error.message}`, error.stack);
            throw HttpErrorFactory.badRequest("Failed to delete token usage record.");
        }
    }

    /**
     * 批量删除 Token 用量记录
     *
     * @param ids 记录ID数组
     */
    async deleteRecords(ids: string[]): Promise<void> {
        try {
            await this.deleteMany(ids);
        } catch (error) {
            this.logger.error(`批量删除 Token 用量记录失败: ${error.message}`, error.stack);
            throw HttpErrorFactory.badRequest("Failed to delete token usage records.");
        }
    }

    /**
     * 根据关联字段批量删除 Token 用量记录
     *
     * @param field 关联字段名
     * @param value 关联字段的值
     */
    async deleteRecordsByField(field: string, value: string): Promise<void> {
        try {
            const records = await this.findRecordsByCondition({
                [field]: value,
            } as FindOptionsWhere<TokenUsage>);
            if (records.length > 0) {
                const ids = records.map((r) => r.id);
                await this.deleteMany(ids);
            }
        } catch (error) {
            this.logger.error(`按字段批量删除 Token 用量记录失败: ${error.message}`, error.stack);
            throw HttpErrorFactory.badRequest("Failed to delete token usage records by field.");
        }
    }
}
