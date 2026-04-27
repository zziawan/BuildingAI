import AuthGuard from "@buildingai/ui/components/auth/auth-guard";
import GlobalError from "@buildingai/ui/components/exception/global-error";
import { useAuthStore } from "@buildingai/stores";
import MainLayout from "@buildingai/ui/layouts/main/index";
import DefaultLayout from "@buildingai/ui/layouts/styles/default/index";
import { useEffect } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";

import AgentsIndexPage from "@/pages/agents";
import AgentChatPage from "@/pages/agents/detail/chat";
import AgentConfigurationPage from "@/pages/agents/detail/configuration";
import AgentLogsPage from "@/pages/agents/detail/logs";
import AgentMonitoringPage from "@/pages/agents/detail/monitoring";
import AgentPublishPage from "@/pages/agents/detail/publish";
import PublishChatPage from "@/pages/agents/site-chat";
import AgentsWorkspacePage from "@/pages/agents/workspace";
import AppsIndexPage from "@/pages/apps";
import DatasetsIndexPage from "@/pages/datasets";
import DatasetsLayout from "@/pages/datasets/_layouts";
import DatasetsDetailPage from "@/pages/datasets/detail";
import InstallPage from "@/pages/install";
import ModelIndexPage from "@/pages/console/ai/model";
import ModelUsagePage from "@/pages/console/ai/model/usage";
import ModelApiPage from "@/pages/modelapi";

import ConsoleLayout from "../layouts/console";
import DynamicHomePage from "../pages";
import AppIframePage from "../pages/apps/[identifier]";
import ChatPage from "../pages/chat";
import { ForgotPasswordPage } from "../pages/login/forgot-password";
import { LoginPage } from "../pages/login";
import { LoginPhonePage } from "../pages/login/login-phone";
import { LoginWechatPage } from "../pages/login/login-wechat";
import { OAuthCallbackPage } from "../pages/login/oauth-callback";
import AlipayReturnPage from "../pages/payment/alipay-return";

function RouteFallbackRedirect() {
  const location = useLocation();
  const { isLogin } = useAuthStore((state) => state.authActions);

  useEffect(() => {
    const isApiPath = location.pathname === "/api" || location.pathname.startsWith("/api/");
    if (!isApiPath) {
      return;
    }

    window.location.replace(`${location.pathname}${location.search}${location.hash}`);
  }, [location.hash, location.pathname, location.search]);

  const isApiPath = location.pathname === "/api" || location.pathname.startsWith("/api/");
  if (isApiPath) {
    return null;
  }

  if (isLogin()) {
    return <Navigate to="/" replace />;
  }

  return (
    <Navigate
      to={{
        pathname: "/login",
        search: `?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
      }}
      replace
      state={{ redirect: `${location.pathname}${location.search}` }}
    />
  );
}

export const router = createBrowserRouter([
  {
    element: <MainLayout />,
    errorElement: <GlobalError />,
    children: [
      {
        path: "/login",
        element: <LoginPage />,
      },
      {
        path: "/login/wechat",
        element: <LoginWechatPage />,
      },
      {
        path: "/login/phone",
        element: <LoginPhonePage />,
      },
      {
        path: "/login/forgot-password",
        element: <ForgotPasswordPage />,
      },
      {
        path: "/login/oauth-callback",
        element: <OAuthCallbackPage />,
      },
      {
        path: "/install",
        element: <InstallPage />,
      },
      {
        path: "/payment/alipay-return",
        element: <AlipayReturnPage />,
      },
      {
        path: "/agents/:id/configuration",
        element: <AgentConfigurationPage />,
      },
      {
        path: "/agents/:id/publish",
        element: <AgentPublishPage />,
      },
      {
        path: "/agents/:id/logs",
        element: <AgentLogsPage />,
      },
      {
        path: "/agents/:id/monitoring",
        element: <AgentMonitoringPage />,
      },
      {
        path: "/agents/:id/chat",
        element: <AgentChatPage />,
      },
      {
        path: "/agents/:id/c/:uuid",
        element: <AgentChatPage />,
      },
      {
        path: "/agents/:agentId/:accessToken/c/:conversationId",
        element: <PublishChatPage />,
      },
      {
        path: "/agents/:agentId/:accessToken",
        element: <PublishChatPage />,
      },
      {
        element: <DefaultLayout />,
        errorElement: (
          <DefaultLayout>
            <GlobalError />
          </DefaultLayout>
        ),
        children: [
          {
            element: (
              <AuthGuard>
                <DynamicHomePage />
              </AuthGuard>
            ),
            children: [
              {
                index: true,
                element: <ChatPage />,
              },
              {
                path: "/c/:id",
                element: <ChatPage />,
              },
            ],
          },
          {
            path: "/chat",
            element: (
              <AuthGuard>
                <ChatPage />
              </AuthGuard>
            ),
          },
          {
            path: "/chat/:id",
            element: (
              <AuthGuard>
                <ChatPage />
              </AuthGuard>
            ),
          },
          {
            path: "/apps",
            element: <AppsIndexPage />,
          },
          {
            path: "/apps/:identifier/*",
            element: <AppIframePage />,
          },
          {
            path: "/agents",
            element: <AgentsIndexPage />,
          },
          {
            path: "/datasets",
            element: <DatasetsLayout />,
            children: [
              {
                index: true,
                element: <DatasetsIndexPage />,
              },

              {
                path: "/datasets/:id",
                element: (
                  <AuthGuard>
                    <DatasetsDetailPage />
                  </AuthGuard>
                ),
              },
            ],
          },
          {
            path: "/agents/workspace",
            element: <AgentsWorkspacePage />,
          },
          {
            path: "/model",
            element: (
              <AuthGuard>
                <ModelIndexPage />
              </AuthGuard>
            ),
          },
          {
            path: "/model/usage/:id",
            element: (
              <AuthGuard>
                <ModelUsagePage />
              </AuthGuard>
            ),
          },
          {
            path: "/modelapi",
            element: (
              <AuthGuard>
                <ModelApiPage />
              </AuthGuard>
            ),
          },
          {
            path: "*",
            element: <RouteFallbackRedirect />,
          },
        ],
      },

      {
        element: <AuthGuard />,
        children: [
          {
            path: "/console/*",
            element: <ConsoleLayout />,
            errorElement: (
              <ConsoleLayout>
                <GlobalError />
              </ConsoleLayout>
            ),
          },
        ],
      },
      {
        path: "*",
        element: <RouteFallbackRedirect />,
      },
    ],
  },
]);
