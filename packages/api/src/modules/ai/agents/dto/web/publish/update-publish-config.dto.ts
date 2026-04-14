import { IsBoolean, IsOptional } from "class-validator";

export class UpdatePublishConfigDto {
    @IsOptional()
    @IsBoolean()
    enableSite?: boolean;

    @IsOptional()
    @IsBoolean()
    regenerateAccessToken?: boolean;
}
