import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";

import { ApiKey } from "@buildingai/db/entities";

import { CreateApiKeyDto, UpdateApiKeyDto } from "../dto";

/**
 * API Key 服务
 */
@Injectable()
export class ApiKeyService {
    constructor(
        @InjectRepository(ApiKey)
        private readonly apiKeyRepository: Repository<ApiKey>,
    ) {}

    /**
     * 获取用户的所有 API Keys
     */
    async findAllByUserId(userId: string): Promise<ApiKey[]> {
        return this.apiKeyRepository.find({
            where: { userId },
            order: { createdAt: "DESC" },
        });
    }

    /**
     * 根据 ID 获取 API Key
     */
    async findOne(id: string): Promise<ApiKey | null> {
        return this.apiKeyRepository.findOne({ where: { id } });
    }

    /**
     * 创建 API Key
     */
    async create(userId: string, createApiKeyDto: CreateApiKeyDto): Promise<ApiKey> {
        const apiKey = this.apiKeyRepository.create({
            ...createApiKeyDto,
            key: uuidv4(),
            userId,
        });
        return this.apiKeyRepository.save(apiKey);
    }

    /**
     * 更新 API Key
     */
    async update(id: string, updateApiKeyDto: UpdateApiKeyDto): Promise<ApiKey | null> {
        await this.apiKeyRepository.update(id, updateApiKeyDto);
        return this.findOne(id);
    }

    /**
     * 删除 API Key
     */
    async remove(id: string): Promise<void> {
        await this.apiKeyRepository.delete(id);
    }

    /**
     * 更新最近使用时间
     */
    async updateLastUsed(id: string): Promise<void> {
        await this.apiKeyRepository.update(id, { lastUsedAt: new Date() });
    }

    /**
     * 根据 API Key 值查找并验证
     */
    async findByKey(apiKey: string): Promise<ApiKey | null> {
        return this.apiKeyRepository.findOne({ where: { key: apiKey } });
    }
}