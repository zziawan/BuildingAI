import { IsNotEmpty, IsString } from "class-validator";

/**
 * 创建 API Key DTO
 */
export class CreateApiKeyDto {
    /**
     * API Key 名称
     */
    @IsString()
    @IsNotEmpty()
    name: string;
}