import { IsNotEmpty, IsOptional, IsString, Length, Matches, MinLength } from "class-validator";

const MOBILE_REGEX = /^1[3-9]\d{9}$/;

export class ForgotPasswordSendSmsCodeDto {
    @IsNotEmpty()
    @IsString()
    @Matches(MOBILE_REGEX, { message: "请输入有效的手机号" })
    mobile: string;

    @IsOptional()
    @IsString()
    areaCode: string = "86";
}

export class ForgotPasswordVerifySmsCodeDto {
    @IsNotEmpty()
    @IsString()
    @Matches(MOBILE_REGEX, { message: "请输入有效的手机号" })
    mobile: string;

    @IsNotEmpty()
    @IsString()
    @Length(6, 6)
    code: string;

    @IsOptional()
    @IsString()
    areaCode: string = "86";
}

export class ResetPasswordByTokenDto {
    @IsNotEmpty()
    @IsString()
    resetToken: string;

    @IsNotEmpty()
    @IsString()
    @MinLength(6, { message: "密码长度不能少于6个字符" })
    newPassword: string;

    @IsNotEmpty()
    @IsString()
    @MinLength(6, { message: "确认密码长度不能少于6个字符" })
    confirmPassword: string;
}