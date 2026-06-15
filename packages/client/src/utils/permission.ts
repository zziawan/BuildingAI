import type { MenuItem } from "@buildingai/web-types";

/**
 * Web首页路径
 */
export const WEB_HOME_PATH = "/";

const RESTRICTED_ROOT_CODES = new Set(["workspace"]);
const RESTRICTED_BRANCH_PUBLIC_CODES = new Set(["api-key"]);

function hasMenuPermission(menu: MenuItem, userInfo?: any, inRestrictedBranch = false): boolean {
  if (userInfo?.isRoot) {
    return true;
  }

  const userPermissions = userInfo?.permissionsCodes ?? [];

  if (inRestrictedBranch && !menu.permissionCode) {
    if (menu.code && RESTRICTED_BRANCH_PUBLIC_CODES.has(menu.code)) {
      return true;
    }
    return false;
  }

  if (!menu.permissionCode) {
    return true;
  }

  return userPermissions.includes(menu.permissionCode);
}

function normalizePath(path: string): string {
  const trimmedPath = path.replace(/\/+$/, "");
  return trimmedPath || "/";
}

/**
 * 获取用户可访问的第一个控制台菜单路径
 */
export function getFirstConsoleMenuPath(menus: MenuItem[], userInfo?: any): string {
  if (!menus || menus.length === 0) {
    const userPermissions = userInfo?.permissionsCodes ?? [];
    return userInfo?.isRoot || userPermissions.includes("analyse:dashboard")
      ? "/console/dashboard"
      : WEB_HOME_PATH;
  }

  // 递归查找第一个可访问的菜单
  const findFirstAccessible = (
    items: MenuItem[],
    basePath = "",
    inRestrictedBranch = false,
  ): string | null => {
    for (const menu of items) {
      // 跳过隐藏的和按钮类型
      if (menu.isHidden === 1 || menu.type === 3) {
        continue;
      }

      const currentInRestrictedBranch =
        inRestrictedBranch || RESTRICTED_ROOT_CODES.has(menu.code || "");

      if (!hasMenuPermission(menu, userInfo, currentInRestrictedBranch)) {
        continue;
      }

      const menuPath = basePath ? `${basePath}/${menu.path}`.replace(/\/+/g, "/") : menu.path;
      const fullPath = `/console/${menuPath}`.replace(/\/+/g, "/");

      // 如果有component，说明是可访问的页面
      if (menu.component) {
        return normalizePath(fullPath);
      }

      // 递归查找子菜单
      if (menu.children && menu.children.length > 0) {
        const childPath = findFirstAccessible(
          menu.children,
          menuPath,
          currentInRestrictedBranch,
        );
        if (childPath) {
          return childPath;
        }
      }
    }
    return null;
  };

  const firstMenuPath = findFirstAccessible(menus);
  if (firstMenuPath) {
    return firstMenuPath;
  }

  const userPermissions = userInfo?.permissionsCodes ?? [];
  return userInfo?.isRoot || userPermissions.includes("analyse:dashboard")
    ? "/console/dashboard"
    : WEB_HOME_PATH;
}

/**
 * 检查用户是否有控制台访问权限
 */
export function hasConsoleAccess(userInfo: any): boolean {
  // 已登录且有菜单即可访问控制台
  return !!userInfo && !!userInfo.menus && userInfo.menus.length > 0;
}

/**
 * 检查用户是否有访问指定路径的权限
 */
export function hasConsoleRouteAccess(userInfo: any, currentPath: string): boolean {
  if (!userInfo || !userInfo.menus) {
    return false;
  }

  // 超级管理员可以访问所有路径
  if (userInfo.isRoot) {
    return true;
  }

  // 标准化路径（去除尾部斜杠）
  const normalizedPath = normalizePath(currentPath);

  // 获取用户的权限码列表
  const userPermissions = userInfo.permissionsCodes ?? [];

  // 递归检查菜单树中是否包含该路径且有权限
  const checkPathInMenus = (
    menus: MenuItem[],
    basePath = "",
    inRestrictedBranch = false,
  ): boolean => {
    for (const menu of menus) {
      // 跳过隐藏的、按钮类型和没有权限的菜单
      if (menu.isHidden === 1 || menu.type === 3) {
        continue;
      }

      const menuPath = basePath ? `${basePath}/${menu.path}`.replace(/\/+/g, "/") : menu.path;
      const fullPath = normalizePath(`/console/${menuPath}`.replace(/\/+/g, "/"));

      const currentInRestrictedBranch =
        inRestrictedBranch || RESTRICTED_ROOT_CODES.has(menu.code || "");

      if (currentInRestrictedBranch && !menu.permissionCode) {
        if (menu.code && RESTRICTED_BRANCH_PUBLIC_CODES.has(menu.code)) {
          return normalizedPath === fullPath || normalizedPath.startsWith(fullPath + "/");
        }
        if (menu.code === "operation" && menu.component) {
          return normalizedPath === fullPath || normalizedPath.startsWith(fullPath + "/");
        }
        if (menu.children && menu.children.length > 0) {
          if (
            checkPathInMenus(
              menu.children,
              basePath ? `${basePath}/${menu.path}`.replace(/\/+/g, "/") : menu.path,
              currentInRestrictedBranch,
            )
          ) {
            return true;
          }
        }
        continue;
      }

      // 检查菜单权限
      if (menu.permissionCode && !userPermissions.includes(menu.permissionCode)) {
        // 没有权限，跳过此菜单及其子菜单
        continue;
      }

      // 仅页面菜单允许匹配，防止目录路径前缀越权
      if (
        menu.component &&
        (normalizedPath === fullPath || normalizedPath.startsWith(fullPath + "/"))
      ) {
        return true;
      }

      // 递归检查子菜单
      if (menu.children && menu.children.length > 0) {
        if (checkPathInMenus(menu.children, menuPath, currentInRestrictedBranch)) {
          return true;
        }
      }
    }
    return false;
  };

  return checkPathInMenus(userInfo.menus);
}
