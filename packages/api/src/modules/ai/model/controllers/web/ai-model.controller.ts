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

function extractAssistantTextFromUIMessage(message: any): string {
    if (!message?.parts || !Array.isArray(message.parts)) {
        return "";
    }

    return message.parts
        .filter((part: any) => part?.type === "text" && typeof part?.text === "string")
        .map((part: any) => part.text)
        .join("");
}

function toOpenAIUsage(usage: any) {
    if (!usage || typeof usage !== "object") {
        return undefined;
    }

    const promptTokens = Number(usage.inputTokens ?? usage.prompt_tokens ?? 0) || 0;
    const completionTokens = Number(usage.outputTokens ?? usage.completion_tokens ?? 0) || 0;
    const totalTokens = Number(usage.totalTokens ?? promptTokens + completionTokens) || 0;

    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
    };
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

function extractInternalPayload(line: string): string {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) {
        return "";
    }

    const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
    if (!payload || payload === "[DONE]") {
        return "";
    }

    return payload;
}

function extractTextFromUnknownChunk(value: unknown, depth: number = 0): string {
    if (depth > 6) {
        return "";
    }

    if (typeof value === "string") {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((item) => extractTextFromUnknownChunk(item, depth + 1)).join("");
    }

    if (!value || typeof value !== "object") {
        return "";
    }

    const data = value as Record<string, unknown>;

    if (typeof data.delta === "string") {
        return data.delta;
    }

    if (typeof data.text === "string") {
        return data.text;
    }

    if (typeof data.content === "string") {
        return data.content;
    }

    if (Array.isArray(data.parts)) {
        return data.parts
            .map((part) => {
                if (!part || typeof part !== "object") {
                    return "";
                }
                const p = part as Record<string, unknown>;
                return p.type === "text" && typeof p.text === "string" ? p.text : "";
            })
            .join("");
    }

    if (Array.isArray(data.content)) {
        return data.content
            .map((part) => {
                if (!part || typeof part !== "object") {
                    return "";
                }
                const p = part as Record<string, unknown>;
                return typeof p.text === "string" ? p.text : "";
            })
            .join("");
    }

    if (data.message) {
        const text = extractAssistantTextFromUIMessage(data.message);
        if (text) {
            return text;
        }
    }

    if (data.responseMessage) {
        const text = extractAssistantTextFromUIMessage(data.responseMessage);
        if (text) {
            return text;
        }
    }

    if (Array.isArray(data.choices)) {
        const firstChoice = data.choices[0] as Record<string, unknown> | undefined;
        const delta = firstChoice?.delta as Record<string, unknown> | undefined;
        if (delta && typeof delta.content === "string") {
            return delta.content;
        }
    }

    const nestedPriorityKeys = ["data", "output", "result", "value", "payload", "message"];
    for (const key of nestedPriorityKeys) {
        if (key in data) {
            const text = extractTextFromUnknownChunk(data[key], depth + 1);
            if (text) {
                return text;
            }
        }
    }

    let longest = "";
    for (const val of Object.values(data)) {
        const text = extractTextFromUnknownChunk(val, depth + 1);
        if (text.length > longest.length) {
            longest = text;
        }
    }

    if (longest) {
        return longest;
    }

    return "";
}

function extractInternalTextDelta(line: string): string {
    const payload = extractInternalPayload(line);
    if (!payload) {
        return "";
    }

    // Vercel AI SDK data stream protocol:
    // Text parts use prefix "0:" → e.g. 0:"Hello"
    // Finish step uses prefix "e:" → e.g. e:{...}
    // Finish message uses prefix "d:" → e.g. d:{...}
    // Tool calls, errors, etc. use other single-char prefixes
    if (payload.length > 2 && payload[1] === ":") {
        const prefix = payload[0];
        const partValue = payload.slice(2);

        // Only extract text from type "0" (text delta) parts
        // Ignore "e" (step finish), "d" (message finish), "2" (tool calls), etc.
        if (prefix === "0") {
            try {
                // partValue is a JSON-encoded string e.g. "\"Hello\""
                const decoded = JSON.parse(partValue);
                if (typeof decoded === "string") {
                    return decoded;
                }
                return extractTextFromUnknownChunk(decoded);
            } catch {
                // If JSON parse fails, try to strip surrounding quotes manually
                const stripped = partValue.trim();
                if (stripped.startsWith('"') && stripped.endsWith('"')) {
                    return stripped.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
                }
                return "";
            }
        }

        // For all other prefixes (e, d, 1, 2, 3, ...) → not text content
        return "";
    }

    // Fallback: plain JSON payload (non-Vercel-protocol SSE line)
    try {
        const data = JSON.parse(payload);
        return extractTextFromUnknownChunk(data);
    } catch {
        return "";
    }
}

function extractLooseTextFromLine(line: string): string {
    const payload = extractInternalPayload(line);
    if (!payload) {
        return "";
    }

    // If this looks like a Vercel AI SDK data stream line (single-char prefix + colon),
    // only process type "0" (text delta) — skip all others
    if (payload.length > 2 && payload[1] === ":") {
        const prefix = payload[0];
        if (prefix !== "0") {
            return "";
        }
    }

    let raw = payload;
    if (raw.length > 2 && raw[1] === ":") {
        raw = raw.slice(2);
    }

    const trimmed = raw.trim();
    if (!trimmed) {
        return "";
    }

    if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
        try {
            const decoded = JSON.parse(trimmed);
            return typeof decoded === "string" ? decoded : "";
        } catch {
            // fallback to regex extraction below
        }
    }

    const match = trimmed.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/);
    if (!match?.[1]) {
        return "";
    }

    try {
        return JSON.parse(`"${match[1]}"`);
    } catch {
        return match[1];
    }
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

        // 参考 LiteLLM model resolution：支持 "provider/modelName" 和 UUID 两种格式
        let model: Awaited<ReturnType<typeof this.aiModelService.findOne>>;
        if (modelId.includes("/")) {
            // "provider/modelName" 格式，如 "unicloud/DeepSeek-R1-Distill-Qwen-14B"
            const slashIdx = modelId.indexOf("/");
            const providerKey = modelId.slice(0, slashIdx);
            const modelName = modelId.slice(slashIdx + 1);
            model = await this.aiModelService.findOne({
                where: { model: modelName, isActive: true, provider: { provider: providerKey } } as any,
                relations: ["provider"],
            });
        } else {
            // UUID 格式
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

        const messages = normalizedBody.messages || [];
        if (!messages.length && normalizedBody.prompt) {
            messages.push({
                role: "user",
                content: normalizedBody.prompt,
            });
        }

        if (!messages.length && typeof normalizedBody.input === "string") {
            messages.push({
                role: "user",
                content: normalizedBody.input,
            });
        }

        if (!messages.length) {
            throw HttpErrorFactory.badRequest("请提供消息内容 (messages array is required)");
        }

        const uiMessages = convertOpenAIMessagesToUIMessages(messages);
        const stream = parseOpenAIStreamFlag(normalizedBody.stream);
        const completionId = `chatcmpl-${generateId()}`;
        const created = Math.floor(Date.now() / 1000);

        const chatParams = {
            userId: apiKey.userId,
            modelId: model.id,  // 始终传 UUID，下游 ChatCompletionService 无需感知 provider/model 格式
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
            stream,
        };

        const executeNonStreamChat = async () => {
            const responseChunks: string[] = [];
            let mockWritableEnded = false;

            const mockRes = {
                get writableEnded() {
                    return mockWritableEnded;
                },
                setHeader: () => mockRes,
                writeHead: () => mockRes,
                write: (chunk: Buffer | string) => {
                    responseChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
                    return true;
                },
                end: (chunk?: Buffer | string) => {
                    if (chunk) {
                        responseChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
                    }
                    mockWritableEnded = true;
                },
                on: () => mockRes,
                once: () => mockRes,
                emit: () => true,
                flushHeaders: () => {},
            } as unknown as Response;

            await this.chatCompletionService.streamChat(
                {
                    ...chatParams,
                    stream: false,
                },
                mockRes,
            );

            const raw = responseChunks.join("");
            try {
                return raw ? JSON.parse(raw) : undefined;
            } catch {
                return undefined;
            }
        };

        if (!stream) {
            const parsed = await executeNonStreamChat();

            const assistantText = extractAssistantTextFromUIMessage(parsed?.message);
            const usage = toOpenAIUsage(parsed?.message?.usage);

            return res.status(200).json({
                id: completionId,
                object: "chat.completion",
                created,
                model: modelId,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: assistantText,
                        },
                        finish_reason: "stop",
                    },
                ],
                ...(usage ? { usage } : {}),
            });
        }

        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        let roleSent = false;
        let doneSent = false;
        let contentSent = false;
        let bufferedText = "";

        let streamResolve!: () => void;
        const streamDone = new Promise<void>((resolve) => { streamResolve = resolve; });

        const writeChunk = (delta: Record<string, unknown>, finishReason: string | null = null) => {
            if (res.writableEnded) return;
            res.write(`data: ${JSON.stringify({
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: modelId,
                choices: [{ index: 0, delta, finish_reason: finishReason }],
            })}\n\n`);
        };

        const flushDone = () => {
            if (doneSent || res.writableEnded) return;
            if (!roleSent) { writeChunk({ role: "assistant" }); roleSent = true; }
            // 只在没有发送过任何内容时才兜底输出（非流式降级）
            if (!contentSent && bufferedText) {
                writeChunk({ content: bufferedText });
                contentSent = true;
            }
            writeChunk({}, "stop");
            res.write("data: [DONE]\n\n");
            doneSent = true;
            res.end();
            streamResolve();
        };

        /**
         * chunk 实际类型是 Uint8Array（或类似 ArrayBufferView），
         * Buffer.isBuffer() 和 typeof === "string" 都会返回 false，
         * String(Uint8Array) 会产生 "100,97,116,97,..." 这样的逗号分隔字节字符串。
         *
         * 另外每个 write() 调用传入的字节可能是**不完整的**（截断的），
         * 所以不能对单个 chunk 做正则完整匹配，需要用独立的字节缓冲区跨 chunk 拼接。
         */
        // 字节级缓冲区，用于跨 chunk 拼接不完整的逗号分隔字节流
        let byteStrBuffer = "";

        const chunkToString = (chunk: unknown): string => {
            // 真实 Buffer
            if (Buffer.isBuffer(chunk)) return chunk.toString("utf8");

            // Uint8Array / ArrayBufferView
            if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString("utf8");
            if (ArrayBuffer.isView(chunk)) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString("utf8");

            // 普通字符串
            if (typeof chunk === "string") return chunk;

            // 其他对象：调用 String() 会得到 "100,97,..." 格式
            // 将其放入字节缓冲区，尝试解码完整部分
            const raw = String(chunk);
            byteStrBuffer += (byteStrBuffer ? "," : "") + raw;

            // 找到最后一个逗号，把完整部分解码，剩余的留在缓冲区
            const lastComma = byteStrBuffer.lastIndexOf(",");
            if (lastComma < 0) return "";

            const complete = byteStrBuffer.slice(0, lastComma);
            byteStrBuffer = byteStrBuffer.slice(lastComma + 1);

            // 验证是否为纯数字（过滤掉意外内容）
            const parts = complete.split(",");
            if (!parts.every(p => /^\d+$/.test(p.trim()))) return complete; // 不是字节格式，直接返回

            try {
                return Buffer.from(parts.map(Number)).toString("utf8");
            } catch {
                return complete;
            }
        };

        // 流结束时刷新字节缓冲区剩余内容
        const flushByteBuffer = (): string => {
            if (!byteStrBuffer) return "";
            const parts = byteStrBuffer.split(",").filter(p => /^\d+$/.test(p.trim()));
            byteStrBuffer = "";
            if (!parts.length) return "";
            try {
                return Buffer.from(parts.map(Number)).toString("utf8");
            } catch {
                return "";
            }
        };

        /**
         * 解析 Vercel AI SDK UIMessageStream 协议的一行。
         *
         * pipeUIMessageStreamToResponse 输出的是 Vercel UIMessageStream 协议，
         * 每行格式：  data: {"type":"text-delta","delta":"Hello"}
         *             data: {"type":"reasoning-delta","id":"...","delta":"..."}
         *             data: {"type":"start"|"start-step"|"finish-step"|"finish"|...}
         *
         * 我们只关心 text-delta 中的 delta 字段作为输出内容。
         * reasoning-delta 是思考过程，不输出给客户端（OpenAI 格式不含 reasoning）。
         */
        const processLine = (line: string): void => {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") return;

            const jsonStr = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
            if (!jsonStr || jsonStr === "[DONE]") return;

            let parsed: Record<string, unknown>;
            try {
                parsed = JSON.parse(jsonStr);
            } catch {
                return;
            }

            const type = parsed.type as string | undefined;

            if (type !== "text-delta") return;

            const delta = typeof parsed.delta === "string" ? parsed.delta : "";
            if (!delta) return;

            bufferedText += delta;
            if (!roleSent) { writeChunk({ role: "assistant" }); roleSent = true; }
            writeChunk({ content: delta });
            contentSent = true;
        };

        // 行缓冲区：chunk 可能被截断，需要跨 chunk 拼接完整行
        let lineBuffer = "";

        const consumeChunk = (chunk: Buffer | string): void => {
            const decoded = chunkToString(chunk);
            lineBuffer += decoded;
            while (true) {
                const idx = lineBuffer.indexOf("\n");
                if (idx < 0) break;
                const line = lineBuffer.slice(0, idx).replace(/\r$/, "");
                lineBuffer = lineBuffer.slice(idx + 1);
                processLine(line);
            }
        };

        const mockRes = {
            get writableEnded() { return doneSent; },
            setHeader: () => mockRes,
            writeHead: () => mockRes,
            write: (chunk: Buffer | string) => {
                consumeChunk(chunk);
                return !res.writableEnded;
            },
            end: (chunk?: Buffer | string) => {
                if (chunk) consumeChunk(chunk);
                // 刷新字节缓冲区剩余内容
                const remaining = flushByteBuffer();
                if (remaining) lineBuffer += remaining;
                // 处理末尾没有换行的残余内容
                if (lineBuffer.trim()) { processLine(lineBuffer.trim()); lineBuffer = ""; }
                flushDone();
            },
            on: () => mockRes,
            once: () => mockRes,
            emit: () => true,
            flushHeaders: () => {},
        } as unknown as Response;

        await (this.chatCompletionService.streamChat(chatParams, mockRes) as any);

        // streamChat 非阻塞，await 返回时流可能还未结束，等待 mockRes.end 触发 streamDone
        const timeout = new Promise<void>((_, rej) =>
            setTimeout(() => rej(new Error("stream timeout")), 5 * 60 * 1000),
        );
        await Promise.race([streamDone, timeout]).catch(() => {});

        if (!doneSent) flushDone();
    }
}
