import { SidebarInset } from "@buildingai/ui/components/ui/sidebar";
import { Outlet, useParams } from "react-router-dom";

import { sidebarConfigMap } from "../_config/sidebar-config";
import { OperationSidebar } from "./sidebar";

/**
 * 营销工具通用布局组件
 * 根据路由参数动态加载对应的侧边栏配置
 */
export default function OperationLayout() {
  const params = useParams();

  // 从路由中提取工具类型（如 'cdk', 'points-task'）
  const toolType = params["*"]?.split("/")[0] || "";
  const config = sidebarConfigMap[toolType];

  if (!config) {
    return null;
  }

  // 构建基础路径
  const basePath = `/console/operation/${toolType}`;

  return (
    <>
      <OperationSidebar config={config} basePath={basePath} />
      <SidebarInset className="flex flex-col overflow-hidden">
        <div className="relative flex-1">
          <Outlet />
        </div>
      </SidebarInset>
    </>
  );
}
