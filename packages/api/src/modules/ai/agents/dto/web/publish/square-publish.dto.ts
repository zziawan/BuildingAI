import { IsArray, IsOptional, IsString, IsUUID } from "class-validator";

export class RejectSquarePublishDto {
    @IsOptional()
    @IsString()
    reason?: string;
}

export class PublishToSquareDto {
    @IsOptional()
    @IsArray()
    @IsUUID("4", { each: true })
    tagIds?: string[];
}
