//http://113.106.126.226:4000/chat/completions


import { BaseController } from "@buildingai/base";
import { AI_DEFAULT_MODEL } from "@buildingai/constants";
import { Public } from "@buildingai/decorators/public.decorator";
import { DictService } from "@buildingai/dict";
import { OpenApiController, WebController } from "@common/decorators/controller.decorator";
import { AiModelService } from "@modules/ai/model/services/ai-model.service";
import { SecretService } from "@buildingai/core/modules";
import { Body, Get, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiKeyService } from "@modules/api-keys/services/api-key.service";
import { HttpErrorFactory } from "@buildingai/errors";
import { TextDecoder } from "node:util";
import { InjectRepository } from "@nestjs/typeorm";
import { UserSubscription } from "@buildingai/db/entities";
import { Repository } from "typeorm";

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

function parseOpenAIStreamFlag(value: unknown): boolean {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "string") {
        return value.toLowerCase() === "true";
    }

    if (typeof value === "number") {
        return value === 1;
    }

    return false;
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

/**
 * 将 AiModel 实体转换为 OpenAI 兼容的 model 对象
 *
 * id 使用 "provider/modelName" 格式（LiteLLM 风格），与 POST /v1/chat/completions 的
 * model 参数解析逻辑保持一致，确保从 GET /v1/models 拿到的 id 能直接用于 chat 调用。
 * 跨 provider 同名模型（如 openai/gpt-4 和 openrouter/gpt-4）也能精确定位。
 *
 * 额外提供 root 字段（纯 model 名）以兼容 OpenAI 原生客户端。
 */
function toOpenAIModelObject(model: any) {
    const providerKey = model.provider?.provider || "custom";
    return {
        id: `${providerKey}/${model.model}`,       // LiteLLM 风格 id，可直接用于 chat/completions
        object: "model",
        created: model.createdAt
            ? Math.floor(new Date(model.createdAt).getTime() / 1000)
            : undefined,
        owned_by: model.provider?.name || providerKey,
        root: model.model,                         // 纯 model 名（如 "gpt-4"），供 OpenAI 原生客户端参考
    };
}

@OpenApiController()

export class modelsOpenApiController extends BaseController {
    constructor(
        private readonly aiModelService: AiModelService,
        private readonly apiKeyService: ApiKeyService,
        @InjectRepository(UserSubscription)
        private readonly userSubscriptionRepository: Repository<UserSubscription>,
    ) {
        super();
    }

    /**
     * 从请求中提取 API Key 并获取对应的 userId
     * 如果未提供 API Key 或 Key 无效，返回 null（降级为返回所有激活模型）
     */
    private async resolveUserIdFromApiKey(req: Request): Promise<string | null> {
        const authorization = req.headers.authorization;
        const apiKeyToken =
            typeof authorization === "string" && authorization.startsWith("Bearer ")
                ? authorization.slice(7).trim()
                : null;

        if (!apiKeyToken) return null;

        const apiKey = await this.apiKeyService.findByKey(apiKeyToken);
        return apiKey?.userId ?? null;
    }

    /**
     * 获取用户当前未过期的会员等级 ID 列表
     */
    private async getUserLevelIds(userId: string): Promise<string[]> {
        const now = new Date();
        const subscriptions = await this.userSubscriptionRepository.find({
            where: { userId },
            select: ["levelId", "endTime"],
        });

        return subscriptions
            .filter((sub) => sub.endTime > now && sub.levelId)
            .map((sub) => sub.levelId);
    }

    /**
     * 获取可用模型列表（OpenAI 兼容格式）
     * @route GET /v1/models
     * @description 通过 API Key 识别用户，只返回用户有权限的模型。
     *  若未提供 API Key，降级返回所有激活模型。
     */
    @Public()
    @Get("models")
    async getAvailableModels(@Req() req: Request) {
        const models = await this.aiModelService.getAvailableModels();

        const userId = await this.resolveUserIdFromApiKey(req);
        if (!userId) {
            // 未提供有效 API Key，降级返回所有激活模型
            const data = models.map(toOpenAIModelObject);
            return { object: "list", data };
        }

        const userLevelIds = await this.getUserLevelIds(userId);

        // 过滤出用户有权限的模型：
        // 1. 模型未设置会员等级限制（membershipLevel 为空），则所有用户可用
        // 2. 模型的会员等级与用户等级有交集，则该用户可用
        // 3. 用户无任何有效会员等级时，只能看到未设置等级限制的模型
        const filteredModels = models.filter((model) => {

            if (!model.isActive || !model.provider?.isActive)  return false;
            
            const modelLevels: string[] = model.membershipLevel || [];
            // 未设置任何等级限制 → 所有用户可用
            if (modelLevels.length === 0) return true;
            // 用户无等级 → 该模型不可用
            if (userLevelIds.length === 0) return false;
            // 用户等级与模型等级有交集 → 可用
            return modelLevels.some((levelId) => userLevelIds.includes(levelId));
        });

        const data = filteredModels.map(toOpenAIModelObject);
        return { object: "list", data };
    }

    /**
     * 获取单个模型信息（OpenAI 兼容格式）
     * @route GET /v1/models/:model
     * @description 支持两种格式：
     *   - provider/modelName（如 "openai/gpt-4"），从 GET /v1/models 列表返回的 id 直接传入
     *   - UUID（如 "550e8400-e29b-41d4-a716-446655440000"）
     *
     * 使用通配符 * 匹配含 "/" 的 model id（如 unicloud/Qwen3.6-35B-A3B），
     * 并从 req.path 中手动提取 model 参数。
     */
    @Public()
    @Get("models/*")
    async getModelInfo(@Req() req: Request) {
        // 从请求路径中提取 model 参数：/v1/models/xxx → "xxx"
        const model = req.path.replace(/^\/v1\/models\//, "");
        let result: Awaited<ReturnType<typeof this.aiModelService.findOne>>;

        if (model.includes("/")) {
            // "provider/modelName" 格式
            const slashIdx = model.indexOf("/");
            const providerKey = model.slice(0, slashIdx);
            const modelName = model.slice(slashIdx + 1);
            result = await this.aiModelService.findOne({
                where: { model: modelName, isActive: true, provider: { provider: providerKey } } as any,
                relations: ["provider"],
                excludeFields: ["apiKey"],
            });
        } else {
            // UUID 格式
            result = await this.aiModelService.findOne({
                where: { id: model, isActive: true },
                relations: ["provider"],
                excludeFields: ["apiKey"],
            });
        }

        if (!result) {
            throw HttpErrorFactory.notFound(`模型 ${model} 不存在或不可用`);
        }

        return toOpenAIModelObject(result);
    }

}

@OpenApiController("chat")
export class AiModelOpenApiController extends BaseController {
    constructor(
        private readonly aiModelService: AiModelService,
        private readonly secretService: SecretService,
        private readonly apiKeyService: ApiKeyService,
    ) {
        super();
    }

    /**
     * OpenAI 兼容聊天接口 - 直接转发到 provider API
     * 不再经过 AI SDK（UIMessage）转换，以原始 OpenAI 格式直接调用 provider 接口
     * @route POST /v1/chat/completions
     */
    @Public()
    @Post("completions")
    async chatWithModelForward(
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

        // 验证用户 API Key
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

        // 参考 LiteLLM model resolution：支持 "provider/modelName" 和 UUID 两种格式
        let model: Awaited<ReturnType<typeof this.aiModelService.findOne>>;
        if (modelId.includes("/")) {
            const slashIdx = modelId.indexOf("/");
            const providerKey = modelId.slice(0, slashIdx);
            const modelName = modelId.slice(slashIdx + 1);
            model = await this.aiModelService.findOne({
                where: { model: modelName, isActive: true, provider: { provider: providerKey } } as any,
                relations: ["provider"],
            });
        } else {
            model = await this.aiModelService.findOne({
                where: { id: modelId, isActive: true },
                relations: ["provider"],
            });
        }

        if (!model) {
            throw HttpErrorFactory.notFound(`模型 ${modelId} 不存在或不可用`);
        }

        if (!model.provider?.isActive) {
            throw HttpErrorFactory.badRequest(`模型提供商 ${model.provider?.name} 未激活`);
        }

        // 提取消息（支持 prompt / input 降级）
        const messages = normalizedBody.messages || [];
        if (!messages.length && normalizedBody.prompt) {
            messages.push({ role: "user", content: normalizedBody.prompt });
        }
        if (!messages.length && typeof normalizedBody.input === "string") {
            messages.push({ role: "user", content: normalizedBody.input });
        }
        if (!messages.length) {
            throw HttpErrorFactory.badRequest("请提供消息内容 (messages array is required)");
        }

        // 获取 provider 密钥配置（apiKey + baseUrl）
        if (!model.provider.bindSecretId) {
            throw HttpErrorFactory.badRequest(`模型提供商 ${model.provider?.name} 未配置密钥`);
        }

        const providerSecret = await this.secretService.getConfigKeyValuePairs(
            model.provider.bindSecretId,
        );
        const providerApiKey = providerSecret.apiKey?.value || "";
        const providerBaseUrl = providerSecret.baseUrl?.value || "";

        if (!providerApiKey) {
            throw HttpErrorFactory.badRequest("模型提供商未配置 API Key");
        }

        // 构建 provider API 端点
        const baseUrl = providerBaseUrl.replace(/\/+$/, "");
        const providerUrl = `${baseUrl}/chat/completions`;

        // 构建转发请求体：直接使用原始 OpenAI 格式 messages，不转成 UIMessage
        const forwardBody: Record<string, unknown> = {
            model: model.model,
            messages,
            stream: normalizedBody.stream ?? false,
        };

        // 透传标准 OpenAI 参数
        const passthroughKeys = [
            "temperature", "top_p", "max_tokens", "n", "stop",
            "presence_penalty", "frequency_penalty", "logit_bias",
            "user", "seed", "tools", "tool_choice", "response_format",
            "max_completion_tokens", "stream_options", "parallel_tool_calls",
        ];
        for (const key of passthroughKeys) {
            if (normalizedBody[key] !== undefined) {
                forwardBody[key] = normalizedBody[key];
            }
        }

        const stream = parseOpenAIStreamFlag(normalizedBody.stream);

        // 直接发起对 provider 的 HTTP 请求
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${providerApiKey}`,
        };

        const upstreamResponse = await fetch(providerUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(forwardBody),
            signal: abortSignal,
        });

        // 上游返回错误时，尝试以 JSON 格式透传错误信息
        if (!upstreamResponse.ok) {
            const errorText = await upstreamResponse.text().catch(() => "");
            res.status(upstreamResponse.status);
            res.setHeader("Content-Type", "application/json");
            try {
                // 尝试透传上游的 JSON 错误
                JSON.parse(errorText);
                res.end(errorText);
            } catch {
                res.end(JSON.stringify({ error: { message: errorText || `Upstream error: ${upstreamResponse.status}` } }));
            }
            return;
        }

        // 非流式：直接转发 JSON 响应
        if (!stream) {
            const data = await upstreamResponse.json();
            return res.status(200).json(data);
        }

        // 流式：直接转发上游 SSE 流，不做任何协议转换
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const reader = upstreamResponse.body?.getReader();
        if (!reader) {
            res.end();
            return;
        }

        const decoder = new TextDecoder();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (value) {
                    const chunk = decoder.decode(value, { stream: !done });
                    if (!res.writableEnded && chunk) {
                        res.write(chunk);
                    }
                }
                if (done) break;
            }
        } catch (err: any) {
            // AbortError 是正常的客户端断开，无需额外处理
        } finally {
            try { reader.releaseLock(); } catch { /* ignore */ }
            if (!res.writableEnded) {
                res.end();
            }
        }
    }
}

