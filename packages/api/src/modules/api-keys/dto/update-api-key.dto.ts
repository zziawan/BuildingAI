import { IsOptional, IsString } from "class-validator";

/**
 * 更新 API Key DTO
 */
export class UpdateApiKeyDto {
    /**
     * API Key 名称
     */
    @IsOptional()
    @IsString()
    name?: string;
}