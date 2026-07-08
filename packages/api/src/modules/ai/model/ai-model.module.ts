import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { AiModel, AiProvider, Dict, Secret, User, ApiKey, TokenUsage, UserSubscription } from "@buildingai/db/entities";
import { Module } from "@nestjs/common";

import { AiChatModule } from "../chat/ai-chat.module";
import { AiProviderService } from "../provider/services/ai-provider.service";
import { AiModelConsoleController } from "./controllers/console/ai-model.controller";
import { AiModelOpenApiController, AiModelWebController, modelsOpenApiController } from "./controllers/web/ai-model.controller";
import { ImagesOpenApiController, ResponsesOpenApiController } from "./controllers/web/model-gateway";
import { AiModelService } from "./services/ai-model.service";
import { TokenUsageService } from "./services/token-usage.service";
import { ApiKeyService } from "@modules/api-keys/services/api-key.service";

/**
 * AI对话记录后台管理模块
 */
@Module({
    imports: [
        AiChatModule,
        TypeOrmModule.forFeature([AiModel, Dict, AiProvider, Secret, User, ApiKey, TokenUsage, UserSubscription]),
    ],
    controllers: [AiModelConsoleController, AiModelWebController, AiModelOpenApiController, modelsOpenApiController, ResponsesOpenApiController, ImagesOpenApiController],
    providers: [AiModelService, AiProviderService, ApiKeyService, TokenUsageService],
    exports: [AiModelService, AiProviderService, TokenUsageService],
})
export class AiModelModule {}