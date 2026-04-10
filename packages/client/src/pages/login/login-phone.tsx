import { SmsScene } from "@buildingai/constants/shared/sms.constant";
import { useSendSmsCodeMutation, useSmsLoginMutation } from "@buildingai/services/web";
import { useAuthStore } from "@buildingai/stores";
import { Button } from "@buildingai/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@buildingai/ui/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
} from "@buildingai/ui/components/ui/field";
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
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { LoginLayout } from "./_components/login-layout";

const MOBILE_REGEX = /^1[3-9]\d{9}$/;

const phoneSchema = z.object({
  mobile: z.string().regex(MOBILE_REGEX, { message: "请输入11位有效手机号" }),
});

const codeSchema = z.object({
  code: z.string().length(6, { message: "请输入6位验证码" }),
});

type PhoneFormValues = z.infer<typeof phoneSchema>;
type CodeFormValues = z.infer<typeof codeSchema>;

/**
 * 手机号验证码登录（独立页）
 */
const LoginPhonePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isLogin = useAuthStore((state) => state.authActions.isLogin);
  const { setToken } = useAuthStore((state) => state.authActions);
  const redirect = searchParams.get("redirect") ?? "";

  if (isLogin()) {
    const target = redirect || "/console/dashboard";
    if (target.startsWith("http")) {
      const url = new URL(target);
      if (url.port && url.pathname.includes("/extension/")) {
        const token = useAuthStore.getState().auth.token;
        if (token) {
          url.searchParams.set("_t", btoa(token));
        }
      }
      window.location.replace(url.toString());
      return null;
    }
    return <Navigate to={target} replace />;
  }

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [mobile, setMobile] = useState("");
  const [smsCountdown, setSmsCountdown] = useState(0);

  const phoneForm = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { mobile: "" },
  });

  const codeForm = useForm<CodeFormValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  const { mutateAsync: sendSmsCode, isPending: isSendPending } = useSendSmsCodeMutation();
  const { mutateAsync: smsLogin, isPending: isSmsLoginPending } = useSmsLoginMutation();

  useEffect(() => {
    if (smsCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setSmsCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [smsCountdown]);

  const handleRedirect = useCallback(
    (path: string, token?: string) => {
      const isPluginPath = path.includes("/extension/");
      if (isPluginPath && import.meta.env.DEV && token) {
        const encodedToken = btoa(token);
        const url = new URL(path, window.location.origin);
        url.searchParams.set("_t", encodedToken);
        window.location.replace(url.toString());
      } else if (path.startsWith("http")) {
        window.location.replace(path);
      } else if (isPluginPath) {
        window.location.replace(path);
      } else {
        navigate(path, { replace: true });
      }
    },
    [navigate],
  );

  const onPhoneNext = async (values: PhoneFormValues) => {
    setMobile(values.mobile);
    setStep("code");
    codeForm.reset({ code: "" });
  };

  const onSendCode = async () => {
    if (!MOBILE_REGEX.test(mobile)) {
      phoneForm.setError("mobile", { message: "请先输入有效手机号" });
      setStep("phone");
      return;
    }
    if (smsCountdown > 0) return;
    await sendSmsCode({
      mobile,
      scene: SmsScene.LOGIN,
      areaCode: "86",
    });
    setSmsCountdown(60);
  };

  const onCodeSubmit = async (values: CodeFormValues) => {
    const data = await smsLogin({
      mobile,
      code: values.code,
      terminal: 1,
      areaCode: "86",
    });
    setToken(data.token);
    handleRedirect(redirect || "/", data.token);
  };

  const backLink = redirect
    ? `/login?${new URLSearchParams({ redirect }).toString()}`
    : "/login";

  return (
    <LoginLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">手机登录</CardTitle>
          <CardDescription>
            {step === "phone" ? "输入手机号后继续" : "输入短信验证码"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "phone" ? (
            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(onPhoneNext)}>
                <FieldGroup className="gap-5">
                  <FormField
                    control={phoneForm.control}
                    name="mobile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>手机号</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="请输入11位手机号"
                            autoComplete="tel"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Field>
                    <Button type="submit" className="w-full">
                      下一步
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            </Form>
          ) : (
            <Form {...codeForm}>
              <form onSubmit={codeForm.handleSubmit(onCodeSubmit)}>
                <FieldGroup className="gap-5">
                  <FormField
                    control={codeForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>验证码</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              placeholder="请输入验证码"
                              className="flex-1"
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => void onSendCode()}
                              loading={isSendPending}
                              disabled={smsCountdown > 0 || isSendPending}
                            >
                              {smsCountdown > 0 ? `${smsCountdown}s` : "获取验证码"}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FieldDescription className="text-muted-foreground text-center">
                    验证码将发送至 {mobile}
                  </FieldDescription>
                  <Field>
                    <Button type="submit" className="w-full" loading={isSmsLoginPending}>
                      登录
                    </Button>
                  </Field>
                  <Field>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        setStep("phone");
                        codeForm.reset();
                      }}
                    >
                      修改手机号
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            </Form>
          )}
          <Button variant="outline" className="mt-4 w-full" asChild>
            <Link to={backLink}>
              <ArrowLeft className="mr-2 size-4" />
              返回账号登录
            </Link>
          </Button>
        </CardContent>
      </Card>
    </LoginLayout>
  );
};

export { LoginPhonePage };
