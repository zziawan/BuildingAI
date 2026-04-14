import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { AiModel, AiProvider, Dict, Secret, User, ApiKey } from "@buildingai/db/entities";
import { Module } from "@nestjs/common";

import { AiChatModule } from "../chat/ai-chat.module";
import { AiProviderService } from "../provider/services/ai-provider.service";
import { AiModelConsoleController } from "./controllers/console/ai-model.controller";
import { AiModelWebController } from "./controllers/web/ai-model.controller";
import { AiModelService } from "./services/ai-model.service";
import { ApiKeyService } from "@modules/api-keys/services/api-key.service";

/**
 * AI对话记录后台管理模块
 */
@Module({
    imports: [
        AiChatModule,
        TypeOrmModule.forFeature([AiModel, Dict, AiProvider, Secret, User, ApiKey]),
    ],
    controllers: [AiModelConsoleController, AiModelWebController],
    providers: [AiModelService, AiProviderService, ApiKeyService],
    exports: [AiModelService, AiProviderService],
})
export class AiModelModule {}