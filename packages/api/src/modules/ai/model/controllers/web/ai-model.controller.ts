import { BaseController } from "@buildingai/base";
import { AI_DEFAULT_MODEL } from "@buildingai/constants";
import { Public } from "@buildingai/decorators/public.decorator";
import { DictService } from "@buildingai/dict";
import { WebController } from "@common/decorators/controller.decorator";
import { AiModelService } from "@modules/ai/model/services/ai-model.service";
import { ChatCompletionService } from "@modules/ai/chat/services/ai-chat-completion.service";
import { Body, Get, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Playground } from "@buildingai/decorators/playground.decorator";
import { type UserPlayground } from "@buildingai/db";
import { ApiKeyService } from "@modules/api-keys/services/api-key.service";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { User } from "@buildingai/db/entities";
import { Repository } from "@buildingai/db/typeorm";
import { HttpErrorFactory } from "@buildingai/errors";
import type { UIMessage } from "ai";
import { generateId } from "ai";

/**
 * 将 OpenAI 格式的消息转换为 UIMessage 格式
 * 特别针对 ERNIE 等模型优化，确保 content 为纯字符串
 * @param openaiMessages OpenAI 标准格式的消息数组
 * @returns UIMessage 格式的消息数组
 */
function convertOpenAIMessagesToUIMessages(openaiMessages: any[]): UIMessage[] {
    return openaiMessages.map((msg, index) => {
        // 确保 content 是字符串（针对 ERNIE 等模型的严格要求）
        let contentText = "";
        
        if (typeof msg.content === "string") {
            
            contentText = msg.content;
        } else if (Array.isArray(msg.content)) {
            
            // ERNIE 模型不支持数组格式，必须转换为字符串
            contentText = msg.content
                .filter((item: any) => item.type === "text")
                .map((item: any) => item.text || "")
                .join("\n");
        } else if (msg.content && typeof msg.content === "object") {
            // ⚠️ content 是对象，尝试提取 text 字段
            contentText = msg.content.text || JSON.stringify(msg.content);
        }

        return {
            id: msg.id || generateId(),
            role: msg.role as "user" | "assistant" | "system",
            parts: [
                {
                    type: "text",
                    text: contentText,
                },
            ],
            metadata: {
                sequence: index,
            },
        } as UIMessage;
    });
}

/**
 * AI模型信息控制器（前台）
 *
 * 提供AI模型信息查询和调用功能
 */
@WebController("ai-models")
export class AiModelWebController extends BaseController {
    constructor(
        private readonly aiModelService: AiModelService,
        private readonly dictService: DictService,
        private readonly chatCompletionService: ChatCompletionService,
        private readonly apiKeyService: ApiKeyService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {
        super();
    }

    /**
     * 获取用户可用的模型列表
     */
    @Get()
    async getAvailableModels() {
        return await this.aiModelService.getAvailableModels();
    }

    /**
     * 获取模型详细信息
     */
    @Get(":id")
    async getModelInfo(@Param("id") id: string) {
        const result = await this.aiModelService.findOneById(id, {
            excludeFields: ["apiKey"],
        });

        if (!result) {
            throw new Error(`模型 ${id} 不存在`);
        }

        return result;
    }

    /**
     * 调用模型进行对话
     * @description 通过指定模型ID直接调用模型，支持流式和非流式响应
     * @route POST /chat
     * @compatibility Compatible with OpenAI API format
     * @param body.stream - 是否使用流式响应，默认为true。设置为false时返回JSON格式的完整响应
     */
    @Public()
    @Post("chat")
    async chatWithModel(
        @Body() body: any,
        @Res() res: Response,
        @Req() req: Request,
    ) {
        const abortController = new AbortController();
        const abortSignal =
            (req as any).signal instanceof AbortSignal
                ? (req as any).signal
                : abortController.signal;

        if (!((req as any).signal instanceof AbortSignal)) {
            const handleDisconnect = () => {
                if (!res.writableEnded && !abortSignal.aborted) abortController.abort();
            };
            req.on("close", handleDisconnect);
            req.on("aborted", handleDisconnect);
            res.on("close", handleDisconnect);
            if (req.aborted || req.socket?.destroyed) abortController.abort();
        }

        // Get modelId from request body (OpenAI compatible)
        const modelId = body.model;

        if (!modelId) {
            throw HttpErrorFactory.badRequest("请提供模型ID (model parameter is required)");
        }

        // Extract and validate API Key
        const authorization = req.headers.authorization;
        const apiKeyToken =
            typeof authorization === "string" && authorization.startsWith("Bearer ")
                ? authorization.slice(7).trim()
                : null;

        if (!apiKeyToken) {
            throw HttpErrorFactory.unauthorized("请提供有效的 API Key：Authorization: Bearer <YOUR_API_KEY>");
        }

        const apiKey = await this.apiKeyService.findByKey(apiKeyToken);
        if (!apiKey) {
            throw HttpErrorFactory.unauthorized("无效的 API Key");
        }

        await this.apiKeyService.updateLastUsed(apiKey.id);

        // 验证模型是否存在且可用
        const model = await this.aiModelService.findOne({
            where: { id: modelId, isActive: true },
            relations: ["provider"],
        });

        if (!model) {
            throw HttpErrorFactory.notFound(`模型 ${modelId} 不存在或不可用`);
        }

        if (!model.provider?.isActive) {
            throw HttpErrorFactory.badRequest(`模型提供商 ${model.provider?.name} 未激活`);
        }

        // 构建消息 (OpenAI compatible format)
        const messages = body.messages || [];
        if (!messages.length && body.prompt) {
            messages.push({
                role: "user",
                content: body.prompt,
            });
        }

        if (!messages.length) {
            throw HttpErrorFactory.badRequest("请提供消息内容 (messages array is required)");
        }

        
        const uiMessages = convertOpenAIMessagesToUIMessages(messages);

        // 调用聊天完成服务（内部会再次通过 convertToModelMessages 处理）
        await this.chatCompletionService.streamChat(
            {
                userId: apiKey.userId,
                modelId: modelId,
                conversationId: undefined, // 不保存对话记录
                messages: uiMessages, 
                title: undefined,
                systemPrompt: body.system_prompt || body.systemPrompt,
                mcpServerIds: body.mcp_server_ids || body.mcpServerIds || [],
                abortSignal,
                isRegenerate: false,
                regenerateMessageId: undefined,
                parentId: undefined,
                regenerateParentId: undefined,
                isToolApprovalFlow: false,
                feature: body.feature,
                saveConversation: false, // 不保存对话
                stream: body.stream !== false, // Default to streaming, but allow override
            },
            res,
        );
    }

    /**
     * 获取默认模型
     */
    @Public()
    @Get("default/current")
    async getDefaultModel() {
        const model_id = await this.dictService.get(AI_DEFAULT_MODEL);

        if (model_id) {
            const model = await this.aiModelService.findOneById(model_id, {
                excludeFields: ["apiKey"],
            });
            if (model && model.isActive) {
                return model;
            }
        }

        return null;
    }
}
