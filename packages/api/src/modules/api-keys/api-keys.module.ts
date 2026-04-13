import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { ApiKey } from "@buildingai/db/entities";
import { Module } from "@nestjs/common";

import { ApiKeyWebController } from "./controllers";
import { ApiKeyService } from "./services";

/**
 * API Keys 模块
 */
@Module({
    imports: [TypeOrmModule.forFeature([ApiKey])],
    controllers: [ApiKeyWebController],
    providers: [ApiKeyService],
    exports: [ApiKeyService],
})
export class ApiKeysModule {}