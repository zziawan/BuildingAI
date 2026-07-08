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
import { TokenUsageService } from "@modules/ai/model/services/token-usage.service";
import type { TokenUsageDto } from "@modules/ai/model/dto/token-usage.dto";

const GB18030_DECODER = new TextDecoder("gb18030");

function tryDecodeLatin1AsUtf8(text: string): string {
    return Buffer.from(text, "latin1").toString("utf8");
}

function tryDecodeLatin1AsGb18030(text: string): string {
    return GB18030_DECODER.decode(Buffer.from(text, "latin1"));
}
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

/**
 * OpenAI 兼容的 usage 提取结果
 */
interface OpenAIUsageInfo {
    tokens: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        cached_tokens: number;
        reasoning_tokens: number;
        audio_tokens: number;
    };
    responseId: string;
    model: string;
}

@OpenApiController("chat")
export class AiModelOpenApiController extends BaseController {
    constructor(
        private readonly aiModelService: AiModelService,
        private readonly secretService: SecretService,
        private readonly apiKeyService: ApiKeyService,
        private readonly tokenUsageService: TokenUsageService,
    ) {
        super();
    }

    /**
     * 从 OpenAI 兼容的 JSON 响应中提取 token 用量信息
     *
     * usage 格式（OpenAI Chat Completions API）:
     * {
     *   "prompt_tokens": 9,
     *   "completion_tokens": 12,
     *   "total_tokens": 21,
     *   "prompt_tokens_details": { "cached_tokens": 0, "audio_tokens": 0 },
     *   "completion_tokens_details": { "reasoning_tokens": 0, "audio_tokens": 0 }
     * }
     */
    private extractOpenAIUsage(data: any): OpenAIUsageInfo | null {
        const usage = data?.usage;
        if (!usage) return null;

        return {
            tokens: {
                prompt_tokens: usage.prompt_tokens ?? 0,
                completion_tokens: usage.completion_tokens ?? 0,
                total_tokens: usage.total_tokens ?? 0,
                cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
                reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
                audio_tokens:
                    (usage.prompt_tokens_details?.audio_tokens ?? 0) +
                    (usage.completion_tokens_details?.audio_tokens ?? 0),
            },
            responseId: data.id ?? "",
            model: data.model ?? "",
        };
    }

    /**
     * 根据模型计费规则计算 token 消耗的积分值
     *
     * billingRule: { power: 10, tokens: 1000 } 表示每 1000 tokens 消耗 10 积分
     */
    private calculateCost(tokens: number, billingRule: { power: number; tokens: number }): number {
        if (!billingRule || !billingRule.tokens || billingRule.tokens <= 0) return 0;
        return Math.ceil((tokens / billingRule.tokens) * billingRule.power);
    }

    /**
     * 记录 token 用量到数据库（fire-and-forget，不影响主流程）
     */
    private async recordTokenUsage(
        userId: string,
        apiKeyId: string,
        model: any,
        usageInfo: OpenAIUsageInfo,
    ): Promise<void> {
        if (!userId || !usageInfo) return;

        try {
            const totalCost = this.calculateCost(
                usageInfo.tokens.total_tokens,
                model.billingRule ?? { power: 0, tokens: 1000 },
            );

            const dto: TokenUsageDto = {
                request_id: usageInfo.responseId,
                user_id: userId,
                api_key_id: apiKeyId,
                provider_id: model.provider?.provider ?? "",
                model_id: model.model ?? usageInfo.model,
                prompt_tokens: usageInfo.tokens.prompt_tokens,
                completion_tokens: usageInfo.tokens.completion_tokens,
                total_tokens: usageInfo.tokens.total_tokens,
                cached_tokens: usageInfo.tokens.cached_tokens,
                reasoning_tokens: usageInfo.tokens.reasoning_tokens,
                audio_tokens: usageInfo.tokens.audio_tokens,
                total_cost: totalCost,
                status: "success",
            };

            await this.tokenUsageService.createRecord(dto);
        } catch (err: any) {
            this.logger.error(`记录 Token 用量失败: ${err.message}`, err.stack);
        }
    }

    /**
     * 从 SSE 行中解析 OpenAI usage 数据
     * 提取 responseId 和 usage 字段
     */
    private parseSSELineForUsage(
        line: string,
    ): { id?: string; model?: string; usage?: any } | null {
        if (!line.startsWith("data: ")) return null;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") return null;

        try {
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    /**
     * 提取并去除请求体中的 model 字段，返回 provider 模型名和剩余 body
     * 支持 "provider/modelName" 和 UUID 两种格式
     */
    private async resolveModelAndBody(
        body: any,
    ): Promise<{ model: Awaited<ReturnType<typeof this.aiModelService.findOne>>; remainingBody: any }> {
        const modelId = body.model;

        if (!modelId) {
            throw HttpErrorFactory.badRequest("请提供模型ID (model parameter is required)");
        }

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

        // 去除 model 字段，其余透传
        const { model: _model, ...remainingBody } = body;
        // 将 model 替换为 provider 内部的真实 model 名
        remainingBody.model = model.model;

        return { model, remainingBody };
    }

    /**
     * 从请求中获取 provider 密钥配置
     */
    private async getProviderConfig(model: any): Promise<{
        providerApiKey: string;
        providerBaseUrl: string;
    }> {
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

        return { providerApiKey, providerBaseUrl };
    }

    /**
     * 设置 AbortController，当客户端断开时取消上游请求
     */
    private setupAbortHandler(req: Request, res: Response): { abortSignal: AbortSignal } {
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

        return { abortSignal };
    }

    /**
     * 向 provider 发起上游请求
     */
    private async fetchUpstream(
        providerUrl: string,
        forwardBody: Record<string, unknown>,
        providerApiKey: string,
        abortSignal: AbortSignal,
    ) {
        return fetch(providerUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${providerApiKey}`,
            },
            body: JSON.stringify(forwardBody),
            signal: abortSignal,
        });
    }

    /**
     * 透传上游错误响应
     */
    private async proxyUpstreamError(upstreamResponse: Awaited<ReturnType<typeof this.fetchUpstream>>, res: Response): Promise<void> {
        const errorText = await upstreamResponse.text().catch(() => "");
        res.status(upstreamResponse.status);
        res.setHeader("Content-Type", "application/json");
        try {
            JSON.parse(errorText);
            res.end(errorText);
        } catch {
            res.end(JSON.stringify({ error: { message: errorText || `Upstream error: ${upstreamResponse.status}` } }));
        }
    }

    /**
     * 处理 SSE 流式转发，同时提取 token 用量
     */
    private async proxySSEStream(
        upstreamResponse: Awaited<ReturnType<typeof this.fetchUpstream>>,
        res: Response,
        apiKey: any,
        model: any,
    ): Promise<void> {
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
        let sseBuffer = "";
        let streamResponseId: string | null = null;
        let streamUsageData: any = null;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (value) {
                    const chunk = decoder.decode(value, { stream: !done });
                    if (!res.writableEnded && chunk) {
                        res.write(chunk);
                    }

                    if (!streamUsageData) {
                        sseBuffer += chunk;
                        const lines = sseBuffer.split("\n");
                        sseBuffer = lines.pop() || "";

                        for (const line of lines) {
                            const parsed = this.parseSSELineForUsage(line);
                            if (parsed) {
                                if (parsed.id) streamResponseId = parsed.id;
                                if (parsed.usage) streamUsageData = parsed.usage;
                            }
                        }
                    }
                }
                if (done) break;
            }

            if (!streamUsageData && sseBuffer) {
                const lines = sseBuffer.split("\n");
                for (const line of lines) {
                    const parsed = this.parseSSELineForUsage(line);
                    if (parsed?.usage) {
                        if (parsed.id) streamResponseId = parsed.id;
                        streamUsageData = parsed.usage;
                    }
                }
            }
        } catch (err: any) {
            // AbortError 是正常的客户端断开
        } finally {
            try { reader.releaseLock(); } catch { /* ignore */ }
            if (!res.writableEnded) {
                res.end();
            }
        }

        if (streamUsageData) {
            const usageInfo: OpenAIUsageInfo = {
                tokens: {
                    prompt_tokens: streamUsageData.prompt_tokens ?? 0,
                    completion_tokens: streamUsageData.completion_tokens ?? 0,
                    total_tokens: streamUsageData.total_tokens ?? 0,
                    cached_tokens: streamUsageData.prompt_tokens_details?.cached_tokens ?? 0,
                    reasoning_tokens: streamUsageData.completion_tokens_details?.reasoning_tokens ?? 0,
                    audio_tokens:
                        (streamUsageData.prompt_tokens_details?.audio_tokens ?? 0) +
                        (streamUsageData.completion_tokens_details?.audio_tokens ?? 0),
                },
                responseId: streamResponseId ?? "",
                model: model.model,
            };
            this.recordTokenUsage(apiKey.userId, apiKey.id, model, usageInfo).catch(
                (err) => this.logger.error(`记录 Token 用量失败: ${err.message}`, err.stack),
            );
        }
    }

    /**
     * 处理非流式响应，直接转发 JSON 并记录 token 用量
     */
    private async proxyNonStreamResponse(
        upstreamResponse: Awaited<ReturnType<typeof this.fetchUpstream>>,
        res: Response,
        apiKey: any,
        model: any,
    ): Promise<void> {
        const data = await upstreamResponse.json();
        const usageInfo = this.extractOpenAIUsage(data);
        this.recordTokenUsage(apiKey.userId, apiKey.id, model, usageInfo).catch(
            (err) => this.logger.error(`记录 Token 用量失败: ${err.message}`, err.stack),
        );
        res.status(200).json(data);
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
        const { abortSignal } = this.setupAbortHandler(req, res);

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

        // 解析模型
        const { model } = await this.resolveModelAndBody(normalizedBody);

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

        // 获取 provider 密钥配置
        const { providerApiKey, providerBaseUrl } = await this.getProviderConfig(model);

        // 构建转发请求体
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
        const providerUrl = `${providerBaseUrl.replace(/\/+$/, "")}/chat/completions`;

        const upstreamResponse = await this.fetchUpstream(providerUrl, forwardBody, providerApiKey, abortSignal);

        if (!upstreamResponse.ok) {
            await this.proxyUpstreamError(upstreamResponse, res);
            return;
        }

        if (!stream) {
            await this.proxyNonStreamResponse(upstreamResponse, res, apiKey, model);
        } else {
            await this.proxySSEStream(upstreamResponse, res, apiKey, model);
        }
    }
}

/**
 * OpenAI Responses API 控制器
 *
 * 透传模式直接对接 provider 提供的 /responses 接口，
 * 对标 OpenAI 的 Responses API (POST /v1/responses)。
 */
@OpenApiController()
export class ResponsesOpenApiController extends BaseController {
    constructor(
        private readonly aiModelService: AiModelService,
        private readonly secretService: SecretService,
        private readonly apiKeyService: ApiKeyService,
        private readonly tokenUsageService: TokenUsageService,
    ) {
        super();
    }

    // --- 从 AiModelOpenApiController 复用的工具方法 ---

    /**
     * 从 OpenAI 兼容的 JSON 响应中提取 token 用量信息
     */
    private extractOpenAIUsage(data: any): OpenAIUsageInfo | null {
        const usage = data?.usage;
        if (!usage) return null;

        return {
            tokens: {
                prompt_tokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
                completion_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
                total_tokens: usage.total_tokens ?? 0,
                cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? 0,
                reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens ?? 0,
                audio_tokens:
                    (usage.prompt_tokens_details?.audio_tokens ?? usage.input_tokens_details?.audio_tokens ?? 0) +
                    (usage.completion_tokens_details?.audio_tokens ?? usage.output_tokens_details?.audio_tokens ?? 0),
            },
            responseId: data.id ?? "",
            model: data.model ?? "",
        };
    }

    private calculateCost(tokens: number, billingRule: { power: number; tokens: number }): number {
        if (!billingRule || !billingRule.tokens || billingRule.tokens <= 0) return 0;
        return Math.ceil((tokens / billingRule.tokens) * billingRule.power);
    }

    private async recordTokenUsage(
        userId: string,
        apiKeyId: string,
        model: any,
        usageInfo: OpenAIUsageInfo,
    ): Promise<void> {
        if (!userId || !usageInfo) return;

        try {
            const totalCost = this.calculateCost(
                usageInfo.tokens.total_tokens,
                model.billingRule ?? { power: 0, tokens: 1000 },
            );

            const dto: TokenUsageDto = {
                request_id: usageInfo.responseId,
                user_id: userId,
                api_key_id: apiKeyId,
                provider_id: model.provider?.provider ?? "",
                model_id: model.model ?? usageInfo.model,
                prompt_tokens: usageInfo.tokens.prompt_tokens,
                completion_tokens: usageInfo.tokens.completion_tokens,
                total_tokens: usageInfo.tokens.total_tokens,
                cached_tokens: usageInfo.tokens.cached_tokens,
                reasoning_tokens: usageInfo.tokens.reasoning_tokens,
                audio_tokens: usageInfo.tokens.audio_tokens,
                total_cost: totalCost,
                status: "success",
            };

            await this.tokenUsageService.createRecord(dto);
        } catch (err: any) {
            this.logger.error(`记录 Token 用量失败: ${err.message}`, err.stack);
        }
    }

    private parseSSELineForUsage(
        line: string,
    ): { id?: string; model?: string; usage?: any } | null {
        if (!line.startsWith("data: ")) return null;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") return null;

        try {
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    // --- OpenAI Responses API endpoint ---

    /**
     * OpenAI Responses API 兼容接口 - 直接转发到 provider API
     * @route POST /v1/responses
     *
     * Responses API 请求体 (OpenAI 标准):
     * {
     *   "model": "gpt-4o",
     *   "input": "Hello, world!" | [{ "role": "user", "content": "Hello" }],
     *   "instructions": "You are a helpful assistant.",
     *   "stream": false,
     *   "temperature": 0.7,
     *   "max_output_tokens": 1024,
     *   "tools": [...],
     *   "tool_choice": "auto",
     *   ...
     * }
     *
     * 返回格式:
     * {
     *   "id": "resp_...",
     *   "object": "response",
     *   "status": "completed",
     *   "output": [...],
     *   "usage": { "input_tokens": 10, "output_tokens": 20, "total_tokens": 30, ... }
     * }
     */
    @Public()
    @Post("responses")
    async responsesForward(
        @Body() body: any,
        @Res() res: Response,
        @Req() req: Request,
    ) {
        const normalizedBody = normalizePayloadStrings(body);
        const { abortSignal } = this.setupAbortHandler(req, res);

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

        // 解析模型（支持 "provider/modelName" 和 UUID 两种格式）
        const modelId = normalizedBody.model;
        if (!modelId) {
            throw HttpErrorFactory.badRequest("请提供模型ID (model parameter is required)");
        }

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

        // 验证 input 字段
        if (!normalizedBody.input) {
            throw HttpErrorFactory.badRequest("请提供 input 参数");
        }

        // 获取 provider 密钥配置
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

        // 构建转发请求体：替换 model 为 provider 内部 model 名，其余透传
        const { model: _m, ...restBody } = normalizedBody;
        const forwardBody: Record<string, unknown> = {
            model: model.model,
            ...restBody,
        };

        const stream = parseOpenAIStreamFlag(normalizedBody.stream);
        const baseUrl = providerBaseUrl.replace(/\/+$/, "");
        const providerUrl = `${baseUrl}/responses`;

        // 发起上游请求
        const upstreamResponse = await fetch(providerUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${providerApiKey}`,
            },
            body: JSON.stringify(forwardBody),
            signal: abortSignal,
        });

        // 上游返回错误时透传
        if (!upstreamResponse.ok) {
            const errorText = await upstreamResponse.text().catch(() => "");
            res.status(upstreamResponse.status);
            res.setHeader("Content-Type", "application/json");
            try {
                JSON.parse(errorText);
                res.end(errorText);
            } catch {
                res.end(JSON.stringify({ error: { message: errorText || `Upstream error: ${upstreamResponse.status}` } }));
            }
            return;
        }

        // 非流式：直接转发 JSON 响应，并记录 token 用量
        if (!stream) {
            const data = await upstreamResponse.json();
            const usageInfo = this.extractOpenAIUsage(data);
            this.recordTokenUsage(apiKey.userId, apiKey.id, model, usageInfo).catch(
                (err) => this.logger.error(`记录 Token 用量失败: ${err.message}`, err.stack),
            );
            return res.status(200).json(data);
        }

        // 流式：透传 SSE 流，并提取 usage 信息
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
        let sseBuffer = "";
        let streamResponseId: string | null = null;
        let streamUsageData: any = null;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (value) {
                    const chunk = decoder.decode(value, { stream: !done });
                    if (!res.writableEnded && chunk) {
                        res.write(chunk);
                    }

                    if (!streamUsageData) {
                        sseBuffer += chunk;
                        const lines = sseBuffer.split("\n");
                        sseBuffer = lines.pop() || "";

                        for (const line of lines) {
                            const parsed = this.parseSSELineForUsage(line);
                            if (parsed) {
                                if (parsed.id) streamResponseId = parsed.id;
                                if (parsed.usage) streamUsageData = parsed.usage;
                            }
                        }
                    }
                }
                if (done) break;
            }

            if (!streamUsageData && sseBuffer) {
                const lines = sseBuffer.split("\n");
                for (const line of lines) {
                    const parsed = this.parseSSELineForUsage(line);
                    if (parsed?.usage) {
                        if (parsed.id) streamResponseId = parsed.id;
                        streamUsageData = parsed.usage;
                    }
                }
            }
        } catch (err: any) {
            // AbortError 正常
        } finally {
            try { reader.releaseLock(); } catch { /* ignore */ }
            if (!res.writableEnded) {
                res.end();
            }
        }

        if (streamUsageData) {
            const usageInfo: OpenAIUsageInfo = {
                tokens: {
                    prompt_tokens: streamUsageData.prompt_tokens ?? streamUsageData.input_tokens ?? 0,
                    completion_tokens: streamUsageData.completion_tokens ?? streamUsageData.output_tokens ?? 0,
                    total_tokens: streamUsageData.total_tokens ?? 0,
                    cached_tokens: streamUsageData.prompt_tokens_details?.cached_tokens ?? streamUsageData.input_tokens_details?.cached_tokens ?? 0,
                    reasoning_tokens: streamUsageData.completion_tokens_details?.reasoning_tokens ?? streamUsageData.output_tokens_details?.reasoning_tokens ?? 0,
                    audio_tokens:
                        (streamUsageData.prompt_tokens_details?.audio_tokens ?? streamUsageData.input_tokens_details?.audio_tokens ?? 0) +
                        (streamUsageData.completion_tokens_details?.audio_tokens ?? streamUsageData.output_tokens_details?.audio_tokens ?? 0),
                },
                responseId: streamResponseId ?? "",
                model: model.model,
            };
            this.recordTokenUsage(apiKey.userId, apiKey.id, model, usageInfo).catch(
                (err) => this.logger.error(`记录 Token 用量失败: ${err.message}`, err.stack),
            );
        }
    }

    /**
     * 设置 AbortController，当客户端断开时取消上游请求
     */
    private setupAbortHandler(req: Request, res: Response): { abortSignal: AbortSignal } {
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

        return { abortSignal };
    }
}

/**
 * OpenAI Images API 控制器
 *
 * 透传模式直接对接 provider 提供的 /images/generations 接口，
 * 对标 OpenAI 的 Images API (POST /v1/images/generations)。
 *
 * 计费方式：按每张图片积分计费（基于 n 参数 × 模型计费规则的 power），
 * 不使用上游返回的 usage 数据。
 */
@OpenApiController()
export class ImagesOpenApiController extends BaseController {
    constructor(
        private readonly aiModelService: AiModelService,
        private readonly secretService: SecretService,
        private readonly apiKeyService: ApiKeyService,
        private readonly tokenUsageService: TokenUsageService,
    ) {
        super();
    }

    /**
     * 根据模型计费规则和图片数量计算积分
     *
     * 图片模型按每张图片消耗积分计费：images * billingRule.power
     */
    private calculateImageCost(images: number, billingRule: { power: number; tokens: number }): number {
        if (!billingRule || !billingRule.power || billingRule.power <= 0) return 0;
        return images * billingRule.power;
    }

    /**
     * 记录图片用量到数据库（fire-and-forget，不影响主流程）
     */
    private async recordImageUsage(
        userId: string,
        apiKeyId: string,
        model: any,
        images: number,
        responseId: string,
    ): Promise<void> {
        if (!userId || images <= 0) return;

        try {
            const imagesCost = this.calculateImageCost(
                images,
                model.billingRule ?? { power: 0, tokens: 1000 },
            );

            const dto: TokenUsageDto = {
                request_id: responseId,
                user_id: userId,
                api_key_id: apiKeyId,
                provider_id: model.provider?.provider ?? "",
                model_id: model.model ?? "",
                images: images,
                images_cost: imagesCost,
                total_cost: imagesCost,
                status: "success",
            };

            await this.tokenUsageService.createRecord(dto);
        } catch (err: any) {
            this.logger.error(`记录图片用量失败: ${err.message}`, err.stack);
        }
    }

    /**
     * OpenAI Images API 兼容接口 - 直接转发到 provider API
     * @route POST /v1/images/generations
     *
     * Images API 请求体 (OpenAI 标准):
     * {
     *   "model": "gpt-image-1",
     *   "prompt": "A cute baby sea otter",
     *   "n": 1,
     *   "size": "1024x1024",
     *   "quality": "standard",
     *   "response_format": "b64_json" | "url",
     *   "style": "vivid" | "natural",
     *   "user": "user-123"
     * }
     *
     * 返回格式:
     * {
     *   "created": 1713833628,
     *   "data": [{ "b64_json": "..." | "url": "..." }],
     *   "usage": { ... }
     * }
     */
    @Public()
    @Post("images/generations")
    async imagesGenerationsForward(
        @Body() body: any,
        @Res() res: Response,
        @Req() req: Request,
    ) {
        const normalizedBody = normalizePayloadStrings(body);
        const { abortSignal } = this.setupAbortHandler(req, res);

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

        // 解析模型（支持 "provider/modelName" 和 UUID 两种格式）
        const modelId = normalizedBody.model;
        if (!modelId) {
            throw HttpErrorFactory.badRequest("请提供模型ID (model parameter is required)");
        }

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

        // 验证 prompt 字段
        if (!normalizedBody.prompt) {
            throw HttpErrorFactory.badRequest("请提供 prompt 参数");
        }

        // 获取 provider 密钥配置
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

        // 构建转发请求体：替换 model 为 provider 内部 model 名，其余透传
        const { model: _m, ...restBody } = normalizedBody;
        const forwardBody: Record<string, unknown> = {
            model: model.model,
            ...restBody,
        };

        const baseUrl = providerBaseUrl.replace(/\/+$/, "");
        const providerUrl = `${baseUrl}/images/generations`;

        // 发起上游请求
        const upstreamResponse = await fetch(providerUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${providerApiKey}`,
            },
            body: JSON.stringify(forwardBody),
            signal: abortSignal,
        });

        // 上游返回错误时透传
        if (!upstreamResponse.ok) {
            const errorText = await upstreamResponse.text().catch(() => "");
            res.status(upstreamResponse.status);
            res.setHeader("Content-Type", "application/json");
            try {
                JSON.parse(errorText);
                res.end(errorText);
            } catch {
                res.end(JSON.stringify({ error: { message: errorText || `Upstream error: ${upstreamResponse.status}` } }));
            }
            return;
        }

        // 图片生成非流式接口，直接转发 JSON 响应
        const data = await upstreamResponse.json();

        // 按每张图片计费：图片数量 = n 参数（默认 1）
        const imageCount: number = normalizedBody.n ?? 1;
        this.recordImageUsage(
            apiKey.userId,
            apiKey.id,
            model,
            imageCount,
            data.id ?? "",
        ).catch((err) => this.logger.error(`记录图片用量失败: ${err.message}`, err.stack));

        return res.status(200).json(data);
    }

    /**
     * 设置 AbortController，当客户端断开时取消上游请求
     */
    private setupAbortHandler(req: Request, res: Response): { abortSignal: AbortSignal } {
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

        return { abortSignal };
    }
}



