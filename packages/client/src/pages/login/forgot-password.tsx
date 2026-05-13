import {
  useForgotPasswordSendSmsCodeMutation,
  useForgotPasswordVerifySmsCodeMutation,
  useResetPasswordMutation,
} from "@buildingai/services/web";
import { Button } from "@buildingai/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@buildingai/ui/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@buildingai/ui/components/ui/form";
import { Input } from "@buildingai/ui/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { z } from "zod";

import { LoginLayout } from "./_components/login-layout";

/**
 * 手机找回密码
 */
const MOBILE_REGEX = /^1[3-9]\d{9}$/;

const verifySchema = z.object({
  mobile: z.string().regex(MOBILE_REGEX, { message: "请输入11位有效手机号" }),
  code: z.string().length(6, { message: "请输入6位验证码" }),
});

const resetSchema = z
  .object({
    newPassword: z.string().min(6, { message: "密码长度不能少于6位" }),
    confirmPassword: z.string().min(6, { message: "确认密码长度不能少于6位" }),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "两次输入密码不一致",
    path: ["confirmPassword"],
  });

type VerifyValues = z.infer<typeof verifySchema>;
type ResetValues = z.infer<typeof resetSchema>;

const ForgotPasswordPage = () => {
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [resetToken, setResetToken] = useState("");
  const [verifiedMobile, setVerifiedMobile] = useState("");

  const verifyForm = useForm<VerifyValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: {
      mobile: "",
      code: "",
    },
  });

  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  const { mutateAsync: sendCode, isPending: isSendingCode } = useForgotPasswordSendSmsCodeMutation();
  const { mutateAsync: verifyCode, isPending: isVerifying } = useForgotPasswordVerifySmsCodeMutation();
  const { mutateAsync: resetPassword, isPending: isResetting } = useResetPasswordMutation();

  useEffect(() => {
    if (smsCountdown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setSmsCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [smsCountdown]);

  const onSendCode = async () => {
    const mobile = verifyForm.getValues("mobile");
    if (!MOBILE_REGEX.test(mobile)) {
      verifyForm.setError("mobile", { message: "请先输入有效手机号" });
      return;
    }

    if (smsCountdown > 0) {
      return;
    }

    await sendCode({
      mobile,
      areaCode: "86",
    });

    setSmsCountdown(60);
    toast.success("验证码已发送");
  };

  const onVerifySubmit = async (values: VerifyValues) => {
    const data = await verifyCode({
      mobile: values.mobile,
      code: values.code,
      areaCode: "86",
    });

    setVerifiedMobile(values.mobile);
    setResetToken(data.resetToken);
    toast.success("身份验证成功，请设置新密码");
  };

  const onResetSubmit = async (values: ResetValues) => {
    if (!resetToken) {
      toast.error("重置凭证已失效，请重新获取验证码");
      return;
    }

    await resetPassword({
      resetToken,
      newPassword: values.newPassword,
      confirmPassword: values.confirmPassword,
    });

    toast.success("密码已重置，请返回登录");
    setResetToken("");
    resetForm.reset();
  };

  return (
    <LoginLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">忘记密码</CardTitle>
          <CardDescription>通过手机验证码找回并重置登录密码</CardDescription>
        </CardHeader>
        <CardContent>
          {!resetToken ? (
            <Form {...verifyForm}>
              <form onSubmit={verifyForm.handleSubmit(onVerifySubmit)} className="space-y-4">
                <FormField
                  control={verifyForm.control}
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>手机号</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type="tel" placeholder="请输入11位手机号" autoComplete="tel" {...field} />
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void onSendCode()}
                            loading={isSendingCode}
                            disabled={smsCountdown > 0 || isSendingCode}
                          >
                            {smsCountdown > 0 ? `${smsCountdown}s` : "获取验证码"}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={verifyForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>验证码</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="请输入6位验证码" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" loading={isVerifying}>
                  验证身份
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...resetForm}>
              <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4">
                <p className="text-muted-foreground text-center text-sm">
                  已验证手机号：{verifiedMobile}
                </p>

                <FormField
                  control={resetForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>新密码</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="请输入新密码" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={resetForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>确认新密码</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="请再次输入新密码"
                          autoComplete="new-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" loading={isResetting}>
                  重置密码
                </Button>
              </form>
            </Form>
          )}

          <Button variant="outline" className="w-full" asChild>
            <Link to="/login">
              <ArrowLeft className="mr-2 size-4" />
              返回登录
            </Link>
          </Button>
        </CardContent>
      </Card>
    </LoginLayout>
  );
};

export { ForgotPasswordPage };
