import { BaseController } from "@buildingai/base";
import { AI_DEFAULT_MODEL } from "@buildingai/constants";
import { Public } from "@buildingai/decorators/public.decorator";
import { DictService } from "@buildingai/dict";
import { OpenApiController, WebController } from "@common/decorators/controller.decorator";
import { AiModelService } from "@modules/ai/model/services/ai-model.service";
import { ChatCompletionService } from "@modules/ai/chat/services/ai-chat-completion.service";
import { Body, Get, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiKeyService } from "@modules/api-keys/services/api-key.service";
import { HttpErrorFactory } from "@buildingai/errors";
import type { UIMessage } from "ai";
import { generateId } from "ai";
import { TextDecoder } from "node:util";

const GB18030_DECODER = new TextDecoder("gb18030");

function countChineseChars(text: string): number {
    return (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
}

function countSuspiciousChars(text: string): number {
    return (
        (text.match(/[ÃÂÐÑØãäåæçèéêëìíîïðñòóôõöùúûüýþÿ�]/g) || []).length +
        (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length
    );
}

function looksLikeMojibake(text: string): boolean {
    if (!text) return false;
    return /[ÃÂÐÑØãäåæçèéêëìíîïðñòóôõöùúûüýþÿ�]/.test(text);
}

function scoreDecodedText(text: string): number {
    return countChineseChars(text) * 3 - countSuspiciousChars(text) * 2;
}

function tryDecodeLatin1AsUtf8(text: string): string {
    return Buffer.from(text, "latin1").toString("utf8");
}

function tryDecodeLatin1AsGb18030(text: string): string {
    return GB18030_DECODER.decode(Buffer.from(text, "latin1"));
}

function normalizeUtf8Text(text: string): string {
    if (!looksLikeMojibake(text)) {
        return text;
    }

    const candidates = [text, tryDecodeLatin1AsUtf8(text), tryDecodeLatin1AsGb18030(text)];
    let best = text;
    let bestScore = scoreDecodedText(text);

    for (const candidate of candidates) {
        const score = scoreDecodedText(candidate);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }

    return best;
}

function normalizePayloadStrings<T>(value: T): T {
    if (typeof value === "string") {
        return normalizeUtf8Text(value) as T;
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizePayloadStrings(item)) as T;
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, normalizePayloadStrings(item)]),
        ) as T;
    }

    return value;
}

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

@OpenApiController("chat")
export class AiModelOpenApiController extends BaseController {
    constructor(
        private readonly aiModelService: AiModelService,
        private readonly chatCompletionService: ChatCompletionService,
        private readonly apiKeyService: ApiKeyService,
    ) {
        super();
    }

    /**
     * OpenAI 兼容聊天接口
     * @route POST /v1/chat/completions
     */
    @Public()
    @Post("completions")
    async chatWithModel(
        @Body() body: any,
        @Res() res: Response,
        @Req() req: Request,
    ) {
        const normalizedBody = normalizePayloadStrings(body);
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

        const modelId = normalizedBody.model;

        if (!modelId) {
            throw HttpErrorFactory.badRequest("请提供模型ID (model parameter is required)");
        }

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

        const messages = normalizedBody.messages || [];
        if (!messages.length && normalizedBody.prompt) {
            messages.push({
                role: "user",
                content: normalizedBody.prompt,
            });
        }

        if (!messages.length) {
            throw HttpErrorFactory.badRequest("请提供消息内容 (messages array is required)");
        }

        const uiMessages = convertOpenAIMessagesToUIMessages(messages);

        await this.chatCompletionService.streamChat(
            {
                userId: apiKey.userId,
                modelId: modelId,
                conversationId: undefined,
                messages: uiMessages,
                title: undefined,
                systemPrompt: normalizedBody.system_prompt || normalizedBody.systemPrompt,
                mcpServerIds: normalizedBody.mcp_server_ids || normalizedBody.mcpServerIds || [],
                abortSignal,
                isRegenerate: false,
                regenerateMessageId: undefined,
                parentId: undefined,
                regenerateParentId: undefined,
                isToolApprovalFlow: false,
                feature: normalizedBody.feature,
                saveConversation: false,
                stream: normalizedBody.stream !== false,
            },
            res,
        );
    }
}
