"use client";

import { useAuthStore } from "@buildingai/stores";
import { LucideIcon } from "@buildingai/ui/components/lucide-icon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@buildingai/ui/components/ui/collapsible";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@buildingai/ui/components/ui/hover-card";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@buildingai/ui/components/ui/sidebar";
import type { MenuItem } from "@buildingai/web-types";
import { ChevronRight } from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

const RESTRICTED_ROOT_CODES = new Set(["workspace", "system-manage"]);
const RESTRICTED_BRANCH_PUBLIC_CODES = new Set(["api-key"]);

/**
 * Check if user has permission to access a menu item
 */
function hasMenuPermission(menu: MenuItem, userInfo?: any): boolean {
  // Super admin can access all menus
  if (userInfo?.isRoot) {
    return true;
  }

  const userPermissions = userInfo?.permissionsCodes ?? [];

  // If menu has no permission code, it's accessible to everyone
  if (!menu.permissionCode) {
    return true;
  }

  // Check if user has the required permission
  return userPermissions.includes(menu.permissionCode);
}

/**
 * Filter visible menu items based on type, hidden status, and permissions
 */
function filterVisibleMenus(menus: MenuItem[], userInfo?: any, inRestrictedBranch = false): MenuItem[] {
  return menus
    .map((menu) => {
      const currentInRestrictedBranch = inRestrictedBranch || RESTRICTED_ROOT_CODES.has(menu.code || "");
      const children = menu.children
        ? filterVisibleMenus(menu.children, userInfo, currentInRestrictedBranch)
        : [];

      return {
        menu: {
          ...menu,
          children,
        },
        currentInRestrictedBranch,
      };
    })
    .filter(({ menu, currentInRestrictedBranch }) => {
      if (menu.type === 3 || menu.isHidden === 1) {
        return false;
      }

      const hasVisibleChildren = !!menu.children && menu.children.length > 0;

      if (!userInfo?.isRoot && currentInRestrictedBranch) {
        if (!menu.permissionCode) {
          if (menu.code && RESTRICTED_BRANCH_PUBLIC_CODES.has(menu.code)) {
            return true;
          }
          return hasVisibleChildren;
        }
      }

      if (!hasMenuPermission(menu, userInfo)) {
        return hasVisibleChildren;
      }

      return true;
    })
    .map(({ menu }) => menu)
    // Remove menus with no visible children (for directory/menu types)
    .filter((menu) => {
      // Button type (3) doesn't need children
      if (menu.type === 3) {
        return true;
      }
      // Directory (0) or Menu (1) types should have at least one visible child,
      // or be a directly routable menu with component
      if (menu.type === 0 || menu.type === 1) {
        const hasVisibleChildren =
          !!menu.children
          && menu.children.length > 0
          && menu.children.some((child) => child.type !== 3 && child.isHidden !== 1);

        return hasVisibleChildren || !!menu.component;
      }
      return true;
    });
}

/**
 * Get visible children for a menu item (type 1 or 2 with component)
 */
function getVisibleChildren(menu: MenuItem): MenuItem[] {
  if (!menu.children?.length) return [];
  return menu.children.filter(
    (child) => {
      // Filter by type, hidden status, and component
      if (child.type === 3 || child.isHidden === 1) {
        return false;
      }
      if (!(child.type === 1 || child.component)) {
        return false;
      }

      return true;
    }
  );
}

function NavMenuItem({ menu, basePath = "" }: { menu: MenuItem; basePath?: string }) {
  const location = useLocation();
  const { state, setOpenMobile, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed";

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const menuPath = basePath ? `${basePath}/${menu.path}`.replace(/\/+/g, "/") : menu.path;
  const fullPath = `/console/${menuPath}`.replace(/\/+/g, "/");
  const visibleChildren = getVisibleChildren(menu);
  const isActive = location.pathname.startsWith(fullPath);

  if (visibleChildren.length > 0) {
    if (isCollapsed) {
      return (
        <SidebarMenuItem>
          <HoverCard openDelay={0} closeDelay={0}>
            <HoverCardTrigger asChild>
              <SidebarMenuButton isActive={isActive}>
                <LucideIcon
                  name={
                    (menu.icon?.replace("i-lucide-", "") ||
                      "menu") as keyof typeof dynamicIconImports
                  }
                />
                <span>{menu.name}</span>
              </SidebarMenuButton>
            </HoverCardTrigger>
            <HoverCardContent side="right" align="start" className="w-48 p-1">
              <div className="flex flex-col gap-0.5">
                {visibleChildren.map((child) => {
                  const childPath = `/console/${menuPath}/${child.path}`.replace(/\/+/g, "/");
                  const isChildActive = location.pathname === childPath;
                  return (
                    <Link
                      key={child.id}
                      to={childPath}
                      onClick={handleLinkClick}
                      className={`hover:bg-accent hover:text-accent-foreground rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isChildActive ? "bg-accent text-accent-foreground" : ""
                      }`}
                    >
                      {child.name}
                    </Link>
                  );
                })}
              </div>
            </HoverCardContent>
          </HoverCard>
        </SidebarMenuItem>
      );
    }

    return (
      <Collapsible asChild defaultOpen={isActive}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton tooltip={menu.name}>
              <LucideIcon
                name={
                  (menu.icon?.replace("i-lucide-", "") || "menu") as keyof typeof dynamicIconImports
                }
              />
              <span>{menu.name}</span>
              <SidebarMenuAction asChild className="[[data-state=open]_>_&]:rotate-90">
                <div>
                  <ChevronRight />
                  <span className="sr-only">Toggle</span>
                </div>
              </SidebarMenuAction>
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {visibleChildren.map((child) => {
                const childPath = `/console/${menuPath}/${child.path}`.replace(/\/+/g, "/");
                return (
                  <SidebarMenuSubItem key={child.id}>
                    <SidebarMenuSubButton asChild isActive={location.pathname === childPath}>
                      <Link to={childPath} onClick={handleLinkClick}>
                        <span>{child.name}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={menu.name} isActive={location.pathname === fullPath}>
        <Link to={fullPath} onClick={handleLinkClick}>
          <LucideIcon
            name={
              (menu.icon?.replace("i-lucide-", "") || "menu") as keyof typeof dynamicIconImports
            }
          />
          <span>{menu.name}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavMenuGroup({ group }: { group: MenuItem }) {
  const visibleChildren = getVisibleChildren(group);
  const { state } = useSidebar();
  const isExpanded = state === "expanded";

  if (visibleChildren.length === 0) return null;

  return (
    <SidebarGroup>
      {isExpanded && <SidebarGroupLabel>{group.name}</SidebarGroupLabel>}

      <SidebarMenu>
        {visibleChildren.map((menu) => (
          <NavMenuItem key={menu.id} menu={menu} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function NavMain() {
  const { userInfo } = useAuthStore((state) => state.auth);

  const menuGroups = useMemo(() => {
    if (!userInfo?.menus) return [];
    return filterVisibleMenus(userInfo.menus, userInfo);
  }, [userInfo?.menus, userInfo]);

  return (
    <>
      {menuGroups.map((group) =>
        group.type === 0 ? (
          <NavMenuGroup key={group.id} group={group} />
        ) : (
          <SidebarGroup key={group.id}>
            <SidebarMenu>
              <NavMenuItem menu={group} />
            </SidebarMenu>
          </SidebarGroup>
        ),
      )}
    </>
  );
}
