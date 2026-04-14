import { LOGIN_TYPE } from "@buildingai/constants/shared/auth";
import { useLoginMutation, useRegisterMutation } from "@buildingai/services/web";
import { useAuthStore, useConfigStore } from "@buildingai/stores";
import { Button } from "@buildingai/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@buildingai/ui/components/ui/card";
import { Checkbox } from "@buildingai/ui/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldSeparator,
} from "@buildingai/ui/components/ui/field";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@buildingai/ui/components/ui/form";
import { Input, PasswordInput } from "@buildingai/ui/components/ui/input";
import { Label } from "@buildingai/ui/components/ui/label";
import { useAlertDialog } from "@buildingai/ui/hooks/use-alert-dialog";
import { cn } from "@buildingai/ui/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { AgreementDialog, type AgreementType } from "@/components/agreement-dialog";

const PageEnum = {
  MAIN: "main",
  REGISTER: "register",
} as const;

const MOBILE_REGEX = /^1[3-9]\d{9}$/;

const mainLoginSchema = z.object({
  account: z
    .string()
    .min(1, { message: "请输入邮箱或用户名" })
    .refine((v) => !MOBILE_REGEX.test(v.trim()), {
      message: "手机号请使用「手机登录」",
    })
    .refine(
      (v) => {
        const s = v.trim();
        return (
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || /^[a-zA-Z0-9_]{3,20}$/.test(s)
        );
      },
      { message: "请输入有效邮箱或3-20位用户名" },
    ),
  password: z.string().min(6, { message: "密码至少6位" }),
});

const registerFormSchema = z
  .object({
    username: z
      .string()
      .min(3, { message: "用户名至少3位" })
      .max(20, { message: "用户名最多20位" })
      .regex(/^[a-zA-Z0-9_]+$/, { message: "用户名只能包含字母、数字、下划线" }),
    password: z.string().min(6, { message: "密码至少6位" }),
    confirmPassword: z.string().min(6, { message: "确认密码至少6位" }),
    nickname: z.string().optional(),
    email: z.string().email({ message: "邮箱格式不正确" }).optional().or(z.literal("")),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次密码不一致",
    path: ["confirmPassword"],
  });

type MainLoginFormValues = z.infer<typeof mainLoginSchema>;
type RegisterFormValues = z.infer<typeof registerFormSchema>;

const FormTitle: Record<string, { title: string; description: string }> = {
  [PageEnum.MAIN]: {
    title: "欢迎回来",
    description: "使用邮箱或用户名登录",
  },
  [PageEnum.REGISTER]: {
    title: "创建账号",
    description: "使用用户名和密码注册",
  },
};

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const [page, setPage] = useState<string>(PageEnum.MAIN);
  const { confirm } = useAlertDialog();
  const { setToken } = useAuthStore((state) => state.authActions);
  const { websiteConfig } = useConfigStore((state) => state.config);
  const [agree, setAgree] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [activeAgreement, setActiveAgreement] = useState<AgreementType>("service");
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect =
    (location.state as { redirect?: string })?.redirect ?? searchParams.get("redirect") ?? "";

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

  const loginSettings = websiteConfig?.loginSettings;
  const allowAccountLogin =
    loginSettings?.allowedLoginMethods?.includes(LOGIN_TYPE.ACCOUNT) ?? true;
  const allowAccountRegister =
    loginSettings?.allowedRegisterMethods?.includes(LOGIN_TYPE.ACCOUNT) ?? true;
  const showPolicyAgreement = loginSettings?.showPolicyAgreement ?? true;
  const loginError = searchParams.get("error");

  const redirectSuffix = redirect
    ? `?${new URLSearchParams({ redirect }).toString()}`
    : "";

  const mainLoginForm = useForm<MainLoginFormValues>({
    resolver: zodResolver(mainLoginSchema),
    defaultValues: { account: "", password: "" },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      nickname: "",
      email: "",
    },
  });

  const { mutateAsync: login, isPending: isLoginPending } = useLoginMutation();
  const { mutateAsync: register, isPending: isRegisterPending } = useRegisterMutation();

  useEffect(() => {
    if (page === PageEnum.REGISTER && !allowAccountRegister) {
      setPage(PageEnum.MAIN);
    }
  }, [allowAccountRegister, page]);

  const handleOpenAgreement = useCallback((type: AgreementType) => {
    setActiveAgreement(type);
    setAgreementOpen(true);
  }, []);

  const renderAgreementTrigger = (checkboxId: string) => (
    <span className="flex flex-wrap items-center gap-1">
      <Label htmlFor={checkboxId}>我已阅读并同意</Label>
      <button
        type="button"
        className="text-primary underline-offset-4 hover:underline"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleOpenAgreement("service");
        }}
      >
        《用户协议》
      </button>
      <span>和</span>
      <button
        type="button"
        className="text-primary underline-offset-4 hover:underline"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleOpenAgreement("privacy");
        }}
      >
        《隐私政策》
      </button>
    </span>
  );

  const ensureAgreed = async () => {
    if (!showPolicyAgreement || agree) return true;
    try {
      await confirm({
        title: "服务协议及隐私保护",
        description: (
          <span>
            确认即表示你已阅读并同意{websiteConfig?.webinfo.name}的
            <button
              type="button"
              className="text-primary inline underline-offset-4 hover:underline"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleOpenAgreement("service");
              }}
            >
              《用户协议》
            </button>
            和
            <button
              type="button"
              className="text-primary inline underline-offset-4 hover:underline"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleOpenAgreement("privacy");
              }}
            >
              《隐私政策》
            </button>
          </span>
        ),
        onConfirm: () => setAgree(true),
      });
      return true;
    } catch {
      return false;
    }
  };

  const onMainLoginSubmit = async (values: MainLoginFormValues) => {
    const agreed = await ensureAgreed();
    if (!agreed) return;
    const data = await login({
      username: values.account.trim(),
      password: values.password,
      terminal: 1,
    });
    setToken(data.token);
    handleRedirect(redirect || "/", data.token);
  };

  const onRegisterSubmit = async (values: RegisterFormValues) => {
    const agreed = await ensureAgreed();
    if (!agreed) return;
    const data = await register({
      username: values.username,
      password: values.password,
      confirmPassword: values.confirmPassword,
      terminal: 1,
      ...(values.nickname && { nickname: values.nickname }),
      ...(values.email && { email: values.email }),
    });
    setToken(data.token);
    handleRedirect(redirect || "/", data.token);
  };

  const renderMainStep = () => (
    <>
      {allowAccountLogin ? (
        <Form {...mainLoginForm}>
          <form onSubmit={mainLoginForm.handleSubmit(onMainLoginSubmit)}>
            <FieldGroup className="gap-5">
              <FormField
                control={mainLoginForm.control}
                name="account"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>账号</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="邮箱或用户名"
                        autoComplete="username"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={mainLoginForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <PasswordInput
                        autoComplete="current-password"
                        placeholder="请输入密码"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showPolicyAgreement && (
                <Field>
                  <FieldDescription>
                    <span className="flex items-center gap-3">
                      <Checkbox
                        checked={agree}
                        onCheckedChange={(e) => setAgree(e as boolean)}
                        id="terms-main-login"
                      />
                      {renderAgreementTrigger("terms-main-login")}
                    </span>
                  </FieldDescription>
                </Field>
              )}
              <Field>
                <Button type="submit" className="w-full" loading={isLoginPending}>
                  登录 <ArrowRight />
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </Form>
      ) : (
        <p className="text-muted-foreground text-center text-sm">账号密码登录未开启，请使用下方方式登录</p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-sm">
        <Link
          to={`/login/phone${redirectSuffix}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          手机号码
        </Link>
        <span className="text-muted-foreground">|</span>
        <Link
          to={`/login/wechat${redirectSuffix}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          微信
        </Link>
      </div>

      <FieldSeparator className="mt-6 *:data-[slot=field-separator-content]:bg-card" />

      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <Link
          to="/login/forgot-password"
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          忘记密码
        </Link>
        {allowAccountRegister && (
          <>
            <span className="text-muted-foreground">|</span>
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => setPage(PageEnum.REGISTER)}
            >
              注册
            </button>
          </>
        )}
      </div>
    </>
  );

  const renderRegisterStep = () => (
    <Form {...registerForm}>
      <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)}>
        <FieldGroup className="gap-5">
          <FormField
            control={registerForm.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>用户名</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="3-20位字母、数字、下划线"
                    {...field}
                    autoComplete="username"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={registerForm.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={registerForm.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>确认密码</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={registerForm.control}
            name="nickname"
            render={({ field }) => (
              <FormItem>
                <FormLabel>昵称（选填）</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="昵称" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={registerForm.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>邮箱（选填）</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="m@example.com" {...field} autoComplete="email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {showPolicyAgreement && (
            <Field>
              <FieldDescription>
                <span className="flex items-center gap-3">
                  <Checkbox
                    checked={agree}
                    onCheckedChange={(e) => setAgree(e as boolean)}
                    id="terms-register"
                  />
                  {renderAgreementTrigger("terms-register")}
                </span>
              </FieldDescription>
            </Field>
          )}
          <Field>
            <Button type="submit" className="w-full" loading={isRegisterPending}>
              注册 <ArrowRight />
            </Button>
            <FieldDescription className="text-center">
              已有账号？{" "}
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => setPage(PageEnum.MAIN)}
              >
                登录
              </button>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </Form>
  );

  const titleConfig = FormTitle[page] ?? FormTitle[PageEnum.MAIN];

  return (
    <>
      <div className={cn("flex flex-col gap-4", className)} {...props}>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{titleConfig.title}</CardTitle>
            <CardDescription>{titleConfig.description}</CardDescription>
            {loginError && (
              <p className="text-destructive text-sm">
                {loginError === "missing_code"
                  ? "授权未完成"
                  : loginError === "config"
                    ? "登录配置异常"
                    : loginError === "token_exchange" || loginError === "no_access_token"
                      ? "授权验证失败"
                      : loginError === "userinfo"
                        ? "获取用户信息失败"
                        : "登录失败，请重试"}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {page === PageEnum.MAIN && renderMainStep()}
            {page === PageEnum.REGISTER && renderRegisterStep()}
          </CardContent>
        </Card>
      </div>
      <AgreementDialog
        open={agreementOpen}
        onOpenChange={setAgreementOpen}
        type={activeAgreement}
      />
    </>
  );
}
