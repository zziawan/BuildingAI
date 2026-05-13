import { randomBytes, createHash } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ApiKey } from "@buildingai/db/entities";

import { CreateApiKeyDto, UpdateApiKeyDto } from "../dto";

export type ApiKeyListItem = {
    id: string;
    name: string;
    maskedKey: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
    lastUsedAt: Date | null;
};

export type CreateApiKeyResponse = ApiKeyListItem & {
    key: string;
};

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
    async findAllByUserId(userId: string): Promise<ApiKeyListItem[]> {
        const apiKeys = await this.apiKeyRepository.find({
            where: { userId },
            order: { createdAt: "DESC" },
        });

        return apiKeys.map((apiKey) => this.toListItem(apiKey as any));
    }

    /**
     * 根据 ID 获取 API Key
     */
    async findOne(id: string): Promise<ApiKey | null> {
        return this.apiKeyRepository.findOne({ where: { id } });
    }

    async findOneByUserId(id: string, userId: string): Promise<ApiKey | null> {
        return this.apiKeyRepository.findOne({ where: { id, userId } });
    }

    /**
     * 创建 API Key
     */
    async create(userId: string, createApiKeyDto: CreateApiKeyDto): Promise<CreateApiKeyResponse> {
        const plainKey = this.generateApiKey();
        const keyHash = this.hashApiKey(plainKey);
        const keyPrefix = this.getKeyPrefix(plainKey);
        const keySuffix = this.getKeySuffix(plainKey);
        const apiKey = {
            ...createApiKeyDto,
            keyHash,
            keyPrefix,
            keySuffix,
            userId,
        };

        let savedApiKey: ApiKey;

        try {
            savedApiKey = (await this.apiKeyRepository.save(apiKey as any)) as any;
        } catch (error) {
            if (!this.isLegacyKeyNotNullError(error)) {
                throw error;
            }

            const [legacySavedApiKey] = await this.apiKeyRepository.query(
                `INSERT INTO "api_key" ("name", "key_hash", "key_prefix", "key_suffix", "user_id", "key")
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING "id", "name", "key_prefix", "key_suffix", "user_id", "created_at", "updated_at", "last_used_at"`,
                [createApiKeyDto.name, keyHash, keyPrefix, keySuffix, userId, keyHash],
            );

            return {
                ...this.toListItemFromRaw(legacySavedApiKey),
                key: plainKey,
            };
        }

        return {
            ...this.toListItem(savedApiKey as any),
            key: plainKey,
        };
    }

    /**
     * 更新 API Key
     */
    async update(id: string, userId: string, updateApiKeyDto: UpdateApiKeyDto): Promise<ApiKeyListItem> {
        await this.ensureOwnership(id, userId);
        await this.apiKeyRepository.update(id, updateApiKeyDto);
        const apiKey = await this.findOneByUserId(id, userId);

        if (!apiKey) {
            throw new NotFoundException("API Key not found");
        }

        return this.toListItem(apiKey as any);
    }

    /**
     * 删除 API Key
     */
    async remove(id: string, userId: string): Promise<void> {
        await this.ensureOwnership(id, userId);
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
        return this.apiKeyRepository.findOne({ where: { keyHash: this.hashApiKey(apiKey) } as any });
    }

    private toListItem(apiKey: {
        id: string;
        name: string;
        keyPrefix: string;
        keySuffix: string;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        lastUsedAt: Date | null;
    }): ApiKeyListItem {
        return {
            id: apiKey.id,
            name: apiKey.name,
            maskedKey: this.toMaskedKey(apiKey),
            userId: apiKey.userId,
            createdAt: apiKey.createdAt,
            updatedAt: apiKey.updatedAt,
            lastUsedAt: apiKey.lastUsedAt ?? null,
        };
    }

    private toMaskedKey(apiKey: { keyPrefix: string; keySuffix: string }): string {
        return `${apiKey.keyPrefix}...${apiKey.keySuffix}`;
    }

    private toListItemFromRaw(raw: {
        id: string;
        name: string;
        key_prefix: string;
        key_suffix: string;
        user_id: string;
        created_at: string | Date;
        updated_at: string | Date;
        last_used_at: string | Date | null;
    }): ApiKeyListItem {
        return {
            id: raw.id,
            name: raw.name,
            maskedKey: `${raw.key_prefix}...${raw.key_suffix}`,
            userId: raw.user_id,
            createdAt: new Date(raw.created_at),
            updatedAt: new Date(raw.updated_at),
            lastUsedAt: raw.last_used_at ? new Date(raw.last_used_at) : null,
        };
    }

    private isLegacyKeyNotNullError(error: unknown): boolean {
        if (!error || typeof error !== "object") {
            return false;
        }

        const message = "message" in error && typeof error.message === "string" ? error.message : "";

        return (
            message.includes("null value in column \"key\"") &&
            message.includes("relation \"api_key\"") &&
            message.includes("not-null constraint")
        );
    }

    private generateApiKey(): string {
        return `sk-${randomBytes(18).toString("base64url")}`;
    }

    private hashApiKey(apiKey: string): string {
        return createHash("sha256").update(apiKey).digest("hex");
    }

    private getKeyPrefix(apiKey: string): string {
        return apiKey.slice(0, 8);
    }

    private getKeySuffix(apiKey: string): string {
        return apiKey.slice(-8);
    }

    private async ensureOwnership(id: string, userId: string): Promise<void> {
        const apiKey = await this.findOneByUserId(id, userId);

        if (!apiKey) {
            throw new NotFoundException("API Key not found");
        }
    }
}