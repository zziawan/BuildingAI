import { Button } from "@buildingai/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@buildingai/ui/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { LoginLayout } from "./_components/login-layout";

/**
 * 忘记密码占位页（站内无自助找回时提示联系管理员）
 */
const ForgotPasswordPage = () => {
  return (
    <LoginLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">忘记密码</CardTitle>
          <CardDescription>若需重置密码，请联系管理员</CardDescription>
        </CardHeader>
        <CardContent>
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
