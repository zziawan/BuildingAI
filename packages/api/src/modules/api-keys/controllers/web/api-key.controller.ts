import { type UserPlayground } from "@buildingai/db";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { WebController } from "@common/decorators";
import { Body, Delete, Get, Param, Patch, Post } from "@nestjs/common";

import { CreateApiKeyDto, UpdateApiKeyDto } from "../../dto";
import { ApiKeyService } from "../../services";

/**
 * API Key Web 控制器
 */
@WebController("api-keys")
export class ApiKeyWebController {
    constructor(private readonly apiKeyService: ApiKeyService) {}

    /**
     * 获取当前用户的所有 API Keys
     */
    @Get()
    async findAll(@Playground() user: UserPlayground) {
        return this.apiKeyService.findAllByUserId(user.id);
    }

    /**
     * 创建 API Key
     */
    @Post()
    async create(@Playground() user: UserPlayground, @Body() createApiKeyDto: CreateApiKeyDto) {
        return this.apiKeyService.create(user.id, createApiKeyDto);
    }

    /**
     * 更新 API Key
     */
    @Patch(":id")
    async update(
        @Param("id") id: string,
        @Body() updateApiKeyDto: UpdateApiKeyDto,
    ) {
        return this.apiKeyService.update(id, updateApiKeyDto);
    }

    /**
     * 删除 API Key
     */
    @Delete(":id")
    async remove(@Param("id") id: string) {
        await this.apiKeyService.remove(id);
        return { message: "API Key deleted successfully" };
    }
}