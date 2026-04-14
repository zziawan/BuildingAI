import { getWechatQrcode, getWechatQrcodeStatus } from "@buildingai/services/web";
import { useAuthStore } from "@buildingai/stores";
import { Button } from "@buildingai/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@buildingai/ui/components/ui/card";
import { Skeleton } from "@buildingai/ui/components/ui/skeleton";
import { AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { LoginLayout } from "./_components/login-layout";

/**
 * 微信扫码登录（独立页，复用原弹窗内逻辑）
 */
const LoginWechatPage = () => {
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

  const [wechatQrUrl, setWechatQrUrl] = useState("");
  const [wechatQrKey, setWechatQrKey] = useState("");
  const [wechatLoading, setWechatLoading] = useState(false);
  const [wechatStatus, setWechatStatus] = useState<
    "normal" | "success" | "invalid" | "error" | "code_error"
  >("normal");
  const wechatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wechatPollStartRef = useRef<number>(0);

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

  const fetchWechatQrCode = useCallback(async () => {
    setWechatLoading(true);
    setWechatStatus("normal");
    setWechatQrUrl("");
    setWechatQrKey("");
    try {
      const data = await getWechatQrcode();
      setWechatQrUrl(data.url);
      setWechatQrKey(data.key ?? "");
    } catch {
      setWechatStatus("code_error");
    } finally {
      setWechatLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWechatQrCode();
  }, [fetchWechatQrCode]);

  useEffect(() => {
    if (!wechatQrKey || wechatStatus === "success" || wechatStatus === "invalid") return;
    const POLL_INTERVAL = 2000;
    const MAX_POLL_MS = 60 * 1000;
    wechatPollStartRef.current = Date.now();
    wechatPollRef.current = setInterval(async () => {
      if (Date.now() - wechatPollStartRef.current > MAX_POLL_MS) {
        if (wechatPollRef.current) clearInterval(wechatPollRef.current);
        wechatPollRef.current = null;
        setWechatStatus("invalid");
        return;
      }
      try {
        const data = await getWechatQrcodeStatus(wechatQrKey);
        if (data.is_scan && data.token) {
          if (wechatPollRef.current) clearInterval(wechatPollRef.current);
          wechatPollRef.current = null;
          setWechatStatus("success");
          setToken(data.token);
          handleRedirect(redirect || "/", data.token);
        } else if (data.error) {
          if (wechatPollRef.current) clearInterval(wechatPollRef.current);
          wechatPollRef.current = null;
          setWechatStatus("error");
        }
      } catch {
        if (wechatPollRef.current) clearInterval(wechatPollRef.current);
        wechatPollRef.current = null;
        setWechatStatus("invalid");
      }
    }, POLL_INTERVAL);
    return () => {
      if (wechatPollRef.current) clearInterval(wechatPollRef.current);
      wechatPollRef.current = null;
    };
  }, [wechatQrKey, wechatStatus, setToken, handleRedirect, redirect]);

  useEffect(() => {
    return () => {
      if (wechatPollRef.current) clearInterval(wechatPollRef.current);
    };
  }, []);

  const backLink = redirect
    ? `/login?${new URLSearchParams({ redirect }).toString()}`
    : "/login";

  return (
    <LoginLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">微信登录</CardTitle>
          <CardDescription>请使用微信扫描二维码</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative flex size-52 items-center justify-center overflow-hidden rounded-lg border p-1">
            {wechatLoading && <Skeleton className="size-full" />}
            {!wechatLoading && wechatQrUrl && (
              <>
                <img
                  src={wechatQrUrl}
                  alt="微信登录二维码"
                  className="pointer-events-none size-full object-contain select-none"
                />
                {(wechatStatus === "success" ||
                  wechatStatus === "invalid" ||
                  wechatStatus === "error" ||
                  wechatStatus === "code_error") && (
                  <div className="bg-background/80 absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-sm">
                    {wechatStatus === "success" && (
                      <>
                        <CheckCircle2 className="text-primary mb-2 size-12" />
                        <p className="text-muted-foreground text-sm">登录成功，正在跳转...</p>
                      </>
                    )}
                    {(wechatStatus === "invalid" || wechatStatus === "error") && (
                      <>
                        <AlertCircle className="text-destructive mb-2 size-12" />
                        <p className="text-muted-foreground mb-3 text-center text-sm">
                          {wechatStatus === "invalid" ? "二维码已过期，请刷新" : "登录失败，请重试"}
                        </p>
                        <Button size="sm" variant="secondary" onClick={fetchWechatQrCode}>
                          刷新二维码
                        </Button>
                      </>
                    )}
                    {wechatStatus === "code_error" && (
                      <>
                        <AlertCircle className="text-destructive mb-2 size-12" />
                        <p className="text-muted-foreground mb-3 text-center text-sm">
                          获取二维码失败，请重试
                        </p>
                        <Button size="sm" variant="secondary" onClick={fetchWechatQrCode}>
                          刷新二维码
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <Button variant="outline" className="w-full" asChild>
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

export { LoginWechatPage };
