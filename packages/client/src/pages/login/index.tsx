import { useAuthStore } from "@buildingai/stores";
import { Navigate, useSearchParams } from "react-router-dom";

import { LoginLayout } from "./_components/login-layout";
import { LoginForm } from "./_components/login-form";

const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const { isLogin } = useAuthStore((state) => state.authActions);
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
  return (
    <LoginLayout>
      <LoginForm />
    </LoginLayout>
  );
};

export { LoginPage };
