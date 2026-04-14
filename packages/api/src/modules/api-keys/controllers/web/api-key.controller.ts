import { type UserPlayground } from "@buildingai/db";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { Permissions } from "@common/decorators";
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
    @Permissions({
        code: "api-key:list",
        name: "API Key 列表",
        action: "查看",
        group: "API 管理",
        groupName: "API 管理",
    })
    async findAll(@Playground() user: UserPlayground) {
        return this.apiKeyService.findAllByUserId(user.id);
    }

    /**
     * 创建 API Key
     */
    @Post()
    @Permissions({
        code: "api-key:create",
        name: "创建 API Key",
        action: "创建",
        group: "API 管理",
        groupName: "API 管理",
    })
    async create(@Playground() user: UserPlayground, @Body() createApiKeyDto: CreateApiKeyDto) {
        return this.apiKeyService.create(user.id, createApiKeyDto);
    }

    /**
     * 更新 API Key
     */
    @Patch(":id")
    @Permissions({
        code: "api-key:update",
        name: "更新 API Key",
        action: "编辑",
        group: "API 管理",
        groupName: "API 管理",
    })
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
    @Permissions({
        code: "api-key:delete",
        name: "删除 API Key",
        action: "删除",
        group: "API 管理",
        groupName: "API 管理",
    })
    async remove(@Param("id") id: string) {
        await this.apiKeyService.remove(id);
        return { message: "API Key deleted successfully" };
    }
}