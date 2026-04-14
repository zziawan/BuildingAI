import { Badge } from "@buildingai/ui/components/ui/badge";
import { Button } from "@buildingai/ui/components/ui/button";
import { Skeleton } from "@buildingai/ui/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@buildingai/ui/components/ui/tooltip";
import {
  Activity,
  Braces,
  Brain,
  FileText,
  ScanEye,
  Video,
  Waves,
  Workflow,
  Wrench,
} from "lucide-react";

import { ProviderAvatar } from "@/components/provider-avatar";
import { MODEL_FEATURES, MODEL_FEATURE_DESCRIPTIONS } from "@buildingai/ai-sdk/interfaces";

import type { AiModelWithProvider } from "@buildingai/services/web";

const FEATURE_ICON_MAP: Record<string, React.ElementType> = {
  [MODEL_FEATURES.VISION]: ScanEye,
  [MODEL_FEATURES.AUDIO]: Activity,
  [MODEL_FEATURES.DOCUMENT]: FileText,
  [MODEL_FEATURES.VIDEO]: Video,
  [MODEL_FEATURES.AGENT_THOUGHT]: Brain,
  [MODEL_FEATURES.TOOL_CALL]: Wrench,
  [MODEL_FEATURES.MULTI_TOOL_CALL]: Workflow,
  [MODEL_FEATURES.STREAM_TOOL_CALL]: Waves,
  [MODEL_FEATURES.STRUCTURED_OUTPUT]: Braces,
};

type ModelCardProps = {
  model: AiModelWithProvider;
};

export const ModelCard = ({ model }: ModelCardProps) => {
  return (
    <div className="bg-card group/model-item relative flex flex-col gap-4 rounded-lg border p-4">
      {/* 头部信息 */}
      <div className="flex items-center gap-3">
        <ProviderAvatar
          provider={model.providerId}
          iconUrl={model.provider?.iconUrl}
          name={model.name}
          size="md"
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className="line-clamp-1 font-medium">{model.name}</span>
          <span className="text-muted-foreground text-xs">{model.provider?.name}</span>
        </div>
      </div>

      {/* 状态和类型标签 */}
      <div className="flex min-h-6 flex-wrap items-center gap-2">
        <Badge variant={model.isActive !== false ? "default" : "secondary"}>
          {model.isActive !== false ? "可用" : "不可用"}
        </Badge>
        <Badge variant="outline">{model.modelType || "llm"}</Badge>
        {!model.billingRule?.power && (
          <Badge variant="outline" className="bg-green-50">
            免费
          </Badge>
        )}
      </div>

      {/* 价格信息 */}
      {model.billingRule?.power && (
        <div className="text-sm text-muted-foreground">
          价格：<span className="font-medium text-foreground">{model.billingRule.power} 积分</span>
        </div>
      )}

      {/* 特性图标 */}
      <div className="flex flex-wrap gap-1">
        {model.features && model.features.length > 0 ? (
          model.features.map((feature) => {
            const Icon = FEATURE_ICON_MAP[feature];
            return Icon ? (
              <Tooltip key={feature}>
                <TooltipTrigger asChild>
                  <Icon className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {MODEL_FEATURE_DESCRIPTIONS[feature as keyof typeof MODEL_FEATURE_DESCRIPTIONS]?.name || feature}
                  </p>
                </TooltipContent>
              </Tooltip>
            ) : null;
          })
        ) : (
          <span className="text-xs text-muted-foreground">无特殊特性</span>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="mt-auto pt-2">
        <Button variant="outline" size="sm" className="w-full" disabled>
          使用
        </Button>
      </div>
    </div>
  );
};

type ModelCardSkeletonProps = {
  count?: number;
};

export const ModelCardSkeleton = ({ count = 4 }: ModelCardSkeletonProps) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-card flex h-48 flex-col gap-4 rounded-lg border p-4">
          <div className="flex gap-3">
            <Skeleton className="size-12 rounded-lg" />
            <div className="flex h-full flex-1 flex-col justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>

          <Skeleton className="h-3 w-20" />

          <div className="flex flex-wrap gap-1">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-4 rounded" />
          </div>

          <Skeleton className="mt-auto h-8 w-full rounded" />
        </div>
      ))}
    </>
  );
};
