import { useAiModelsListQuery } from "@buildingai/services/web";
import { useAuthStore } from "@buildingai/stores";
import { Badge } from "@buildingai/ui/components/ui/badge";
import { Button } from "@buildingai/ui/components/ui/button";
import { Input } from "@buildingai/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@buildingai/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@buildingai/ui/components/ui/table";
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
import { useMemo, useState } from "react";

import { PageContainer } from "@/layouts/console/_components/page-container";
import { ProviderAvatar } from "@/components/provider-avatar";
import { MODEL_FEATURES, MODEL_FEATURE_DESCRIPTIONS } from "@buildingai/ai-sdk/interfaces";

type ModelTypeForQuery = "llm" | "text-embedding" | "rerank" | "speech2text" | "tts";

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

/**
 * 模型列表页面
 */
const ModelIndexPage = () => {
  const [nameQuery, setNameQuery] = useState("");
  const [typeQuery, setTypeQuery] = useState<ModelTypeForQuery | "all">("all");

  const { data: models = [], isLoading, error, refetch } = useAiModelsListQuery();
  
  // 检查用户是否登录
  const token = useAuthStore((state) => state.auth.token);
  const isLogin = !!token;

  // 如果用户未登录，重定向到登录页面
  if (!isLogin) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-red-500 text-lg font-medium mb-2">需要登录</div>
            <div className="text-gray-600 mb-4">
              请先登录后再访问模型列表页面
            </div>
            <button 
              onClick={() => window.location.href = '/login'}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              去登录
            </button>
          </div>
        </div>
      </PageContainer>
    );
  }

  // 如果正在加载，显示加载状态
  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <div>加载中...</div>
        </div>
      </PageContainer>
    );
  }

  // 如果有错误，显示错误信息
  if (error) {
    console.error('Models query error:', error);
    
    // 检查是否是认证错误
    const isAuthError = error?.message?.includes('login') || 
                       error?.message?.includes('认证') ||
                       error?.message?.includes('token');
    
    if (isAuthError) {
      return (
        <PageContainer>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="text-red-500 text-lg font-medium mb-2">需要登录</div>
              <div className="text-gray-600 mb-4">
                请先登录后再访问模型列表页面
              </div>
              <button 
                onClick={() => window.location.href = '/login'}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                去登录
              </button>
            </div>
          </div>
        </PageContainer>
      );
    }

    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <div className="text-red-500 text-center">
            <div className="text-lg font-medium mb-2">加载失败</div>
            <div className="text-sm mb-4">
              {error instanceof Error ? error.message : 
               typeof error === 'string' ? error : 
               '未知错误'}
            </div>
            <button 
              onClick={() => refetch()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              重试
            </button>
          </div>
        </div>
      </PageContainer>
    );
  }

  // 过滤模型
  const filteredModels = useMemo(() => {
    let filtered = models;

    // 按名称搜索
    if (nameQuery.trim()) {
      const normalizedQuery = nameQuery.trim().toLowerCase();
      filtered = filtered.filter((model) =>
        `${model.name}`.toLowerCase().includes(normalizedQuery)
      );
    }

    // 按类型过滤
    if (typeQuery !== "all") {
      filtered = filtered.filter((model) => model.modelType === typeQuery);
    }

    return filtered;
  }, [models, nameQuery, typeQuery]);

  return (
    <PageContainer>
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">模型</h1>
          <p className="text-gray-500 mt-1">查看平台上配置的所有模型</p>
        </div>

        {/* 搜索和过滤区域 */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="按名称搜索模型..."
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <Select
            value={typeQuery}
            onValueChange={(value) => setTypeQuery(value as ModelTypeForQuery | "all")}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="选择模型类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="llm">LLM</SelectItem>
              <SelectItem value="text-embedding">文本嵌入</SelectItem>
              <SelectItem value="rerank">重排序</SelectItem>
              <SelectItem value="speech2text">语音转文本</SelectItem>
              <SelectItem value="tts">文本转语音</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 模型表格 */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-1/4">名称</TableHead>
                <TableHead className="w-1/6">类型</TableHead>
                <TableHead className="w-1/6">状态</TableHead>
                <TableHead className="w-1/6">价格</TableHead>
                <TableHead className="w-1/4">特性</TableHead>
                <TableHead className="w-1/6">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredModels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                filteredModels.map((model) => (
                  <TableRow key={model.id} className="hover:bg-muted/50">
                    {/* 名称 */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProviderAvatar
                          provider={model.providerId}
                          iconUrl={model.provider?.iconUrl}
                          name={model.name}
                          size="sm"
                        />
                        <div>
                          <div className="font-medium">{model.name}</div>
                          <div className="text-xs text-muted-foreground">{model.provider?.name}</div>
                        </div>
                      </div>
                    </TableCell>

                    {/* 类型 */}
                    <TableCell>
                      <Badge variant="outline">{model.modelType || "llm"}</Badge>
                    </TableCell>

                    {/* 状态 */}
                    <TableCell>
                      <Badge
                        variant={model.isActive !== false ? "default" : "secondary"}
                      >
                        {model.isActive !== false ? "可用" : "不可用"}
                      </Badge>
                    </TableCell>

                    {/* 价格 */}
                    <TableCell>
                      {!model.billingRule?.power ? (
                        <Badge variant="outline" className="bg-green-50">
                          免费
                        </Badge>
                      ) : (
                        <span className="text-sm">{model.billingRule.power} 积分</span>
                      )}
                    </TableCell>

                    {/* 特性 */}
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
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
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>

                    {/* 操作 */}
                    <TableCell>
                      <Button variant="outline" size="sm" disabled>
                        使用
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* 统计信息 */}
        <div className="text-sm text-muted-foreground">
          共 {filteredModels.length} 个模型
        </div>
      </div>
    </PageContainer>
  );
};

export default ModelIndexPage;
