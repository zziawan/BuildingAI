import { useAuthStore } from "@buildingai/stores";
import NotFoundPage from "@buildingai/ui/components/exception/not-found-page";
import { ScrollArea } from "@buildingai/ui/components/ui/scroll-area";
import { SidebarInset, SidebarProvider } from "@buildingai/ui/components/ui/sidebar";
import type { MenuItem } from "@buildingai/web-types";
import type { ComponentType } from "react";
import { useMemo } from "react";
import type { RouteObject } from "react-router-dom";
import { useRoutes } from "react-router-dom";

import AppNavbar from "./_components/app-navbar";
import { AppSidebar } from "./_components/app-sidebar";

const modules = import.meta.glob<{ default: ComponentType }>(
  ["@/pages/console/**/*.tsx", "!@/pages/console/**/_components/**"],
  { eager: true },
);

/**
 * Hardcoded map from legacy DB component paths (pre-dynamic-router) to the
 * canonical `/src/pages/...` glob key.  Add entries here whenever a page is
 * moved / renamed so the frontend stays resilient against stale DB values.
 */
const LEGACY_COMPONENT_MAP: Record<string, string> = {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  "/console/dashboard": "/src/pages/console/dashboard/index.tsx",

  // ── AI / Agent ─────────────────────────────────────────────────────────────
  "/console/ai/agent/list": "/src/pages/console/ai/agent/list/index.tsx",
  "/console/ai/agent/config": "/src/pages/console/ai/agent/config/index.tsx",

  // ── AI / Datasets ──────────────────────────────────────────────────────────
  "/console/ai/datasets/list": "/src/pages/console/ai/datasets/list/index.tsx",
  "/console/ai/datasets/config": "/src/pages/console/ai/datasets/config/index.tsx",

  // ── AI misc ────────────────────────────────────────────────────────────────
  "/console/ai/model": "/src/pages/console/ai/model/index.tsx",
  "/console/extension": "/src/pages/console/extension/index.tsx",

  // ── Operation ──────────────────────────────────────────────────────────────
  "/console/operation/index": "/src/pages/console/operation/index.tsx",
  "/console/operation": "/src/pages/console/operation/index.tsx",

  // ── Decorate ───────────────────────────────────────────────────────────────
  "/console/decorate/layout/index": "/src/pages/console/decorate/layout/index.tsx",
  "/console/decorate/apps/list": "/src/pages/console/decorate/apps/index.tsx",
  "/console/decorate/agent/index": "/src/pages/console/decorate/agent/index.tsx",

  // ── Chat ───────────────────────────────────────────────────────────────────
  "/console/ai/chat/list": "/src/pages/console/chat/record/index.tsx",
  "/console/ai/chat/setting": "/src/pages/console/chat/config/index.tsx",

  // ── User ───────────────────────────────────────────────────────────────────
  "/console/user/list": "/src/pages/console/user/list/index.tsx",

  // ── Order ──────────────────────────────────────────────────────────────────
  "/console/order/order-membership": "/src/pages/console/order/membership/index.tsx",
  "/console/order/order-recharge": "/src/pages/console/order/recharge/index.tsx",

  // ── Notice ─────────────────────────────────────────────────────────────────
  "/console/notice/sms/index": "/src/pages/console/notice/sms/index.tsx",
  "/console/notice/notification-settings/index":
    "/src/pages/console/notice/notification-settings/index.tsx",

  // ── Channel ────────────────────────────────────────────────────────────────
  "/console/channel/wechatoa/index": "/src/pages/console/channel/wechat-oa/index.tsx",

  // ── Financial ──────────────────────────────────────────────────────────────
  "/console/financial/financial-center": "/src/pages/console/financial/analysis/index.tsx",
  "/console/financial/account-balance":
    "/src/pages/console/financial/balance-details/index.tsx",

  // ── Access / Permission ────────────────────────────────────────────────────
  "/console/permission/list": "/src/pages/console/access/permission/index.tsx",
  "/console/role/list": "/src/pages/console/access/role/index.tsx",
  "/console/menu/list": "/src/pages/console/access/menu/index.tsx",

  // ── System Settings ────────────────────────────────────────────────────────
  "/console/system-setting/login-config/index":
    "/src/pages/console/system/login-config/index.tsx",
  "/console/system-setting/agreement/index":
    "/src/pages/console/system/agreement/index.tsx",
  "/console/system-setting/website/index":
    "/src/pages/console/system/website-config/index.tsx",
  "/console/system-setting/pay-config/index":
    "/src/pages/console/system/pay-config/index.tsx",
  "/console/system-setting/storage-config/index":
    "/src/pages/console/system/storage-config/index.tsx",
};

/**
 * Resolve a menu component string to the actual module key used by import.meta.glob.
 * Resolution order:
 *  1. Legacy map (covers renamed/moved paths stored in the DB before the dynamic router migration)
 *  2. Already a correct /src/pages/… path
 *  3. Short /console/… path → add /src/pages prefix and try index.tsx / .tsx
 */
function resolveModule(component: string) {
  // 1. Legacy map lookup (handles structurally different old paths)
  const legacyKey = LEGACY_COMPONENT_MAP[component];
  if (legacyKey && modules[legacyKey]) return modules[legacyKey];

  const candidates = [
    // 2. Already a full /src/pages/… path (written by upgrade scripts or new seeds)
    component.startsWith("/src/pages/") ? component : null,
    // 3. Short path: /console/foo → /src/pages/console/foo/index.tsx
    `/src/pages${component}/index.tsx`,
    // 4. Short path: /console/foo/index → /src/pages/console/foo/index.tsx (strip trailing /index)
    component.endsWith("/index") ? `/src/pages${component}.tsx` : null,
    // 5. Short path: /console/foo → /src/pages/console/foo.tsx
    `/src/pages${component}.tsx`,
  ].filter(Boolean) as string[];

  for (const key of candidates) {
    if (modules[key]) return modules[key];
  }
  return undefined;
}

/**
 * Convert menu items to react-router RouteObject.
 * basePath accumulates parent path segments so child routes get full paths
 * (e.g. parent "agent" + child "config" → "agent/config").
 */
function generateRoutes(menus: MenuItem[], basePath = ""): RouteObject[] {
  return menus.flatMap((menu) => {
    const routes: RouteObject[] = [];
    const segment = menu.path ?? "";
    // Build full path: join basePath + segment, skip empty segments
    const fullPath =
      basePath && segment ? `${basePath}/${segment}` : segment || basePath;

    if (menu.component) {
      const mod = resolveModule(menu.component);
      const Component = mod?.default;

      if (Component && fullPath) {
        routes.push({
          path: fullPath,
          element: <Component />,
        });
      }
    }

    if (menu.children?.length) {
      routes.push(...generateRoutes(menu.children, fullPath));
    }

    return routes;
  });
}

function ConsoleRoutes() {
  const { userInfo } = useAuthStore((state) => state.auth);

  const routes = useMemo<RouteObject[]>(() => {
    const dynamicRoutes = generateRoutes(userInfo?.menus ?? []);
    return [
      ...dynamicRoutes,
      { path: "*", element: <NotFoundPage /> },
    ];
  }, [userInfo?.menus]);

  return useRoutes(routes);
}

export default function ConsoleLayout({ children }: { children?: React.ReactNode }) {
  return (
    <SidebarProvider storageKey="layout-console-sidebar" className="bd-console-layout h-dvh">
      <AppSidebar />
      <SidebarInset className="flex h-full flex-col overflow-x-hidden md:h-[calc(100%-1rem)] md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0">
        <AppNavbar />
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
            {children ? children : <ConsoleRoutes />}
          </ScrollArea>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
