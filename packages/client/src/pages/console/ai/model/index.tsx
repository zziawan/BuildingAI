import { useDocumentHead } from "@buildingai/hooks";
import { type AiModelWithProvider, useAiModelsListQuery } from "@buildingai/services/web";
import { Input } from "@buildingai/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@buildingai/ui/components/ui/select";
import { useState } from "react";
import { useEffect } from "react";
import { useDebounceValue } from "usehooks-ts";

import { PageContainer } from "@/layouts/console/_components/page-container";

import { ModelCard, ModelCardSkeleton } from "./_components/model-card";

type ModelTypeForQuery = "llm" | "text-embedding" | "rerank" | "speech2text" | "tts";

const ModelIndexPage = () => {
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword] = useDebounceValue(keyword.trim(), 300);
  const [typeQuery, setTypeQuery] = useState<ModelTypeForQuery | "all">("all");
  const [queryParams, setQueryParams] = useState<{ name?: string; modelType?: ModelTypeForQuery }>({});

  const { data: models = [], isLoading, error, refetch } = useAiModelsListQuery();

  useDocumentHead({
    title: "模型管理",
  });

  // Update query params when debounced keyword or type changes
  useEffect(() => {
    setQueryParams((prev) => ({
      ...prev,
      name: debouncedKeyword || undefined,
      modelType: typeQuery !== "all" ? typeQuery : undefined,
    }));
  }, [debouncedKeyword, typeQuery]);

  // Filter models based on query params
  const filteredModels = models.filter((model: AiModelWithProvider) => {
    if (queryParams.name) {
      const normalizedQuery = queryParams.name.toLowerCase();
      if (!`${model.name}`.toLowerCase().includes(normalizedQuery)) {
        return false;
      }
    }
    if (queryParams.modelType && model.modelType !== queryParams.modelType) {
      return false;
    }
    return true;
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setKeyword(value);
  };

  const handleTypeChange = (value: string) => {
    setTypeQuery(value as ModelTypeForQuery | "all");
  };

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">模型</h1>
          <p className="text-gray-500 mt-1">查看平台上配置的所有模型</p>
        </div>

        {/* 搜索和过滤区域 */}
        <div className="bg-background sticky top-0 z-2 grid grid-cols-1 gap-4 pt-1 pb-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          <Input
            placeholder="搜索模型名称"
            className="text-sm"
            value={keyword}
            onChange={handleSearchChange}
          />
          <Select value={typeQuery} onValueChange={handleTypeChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="模型类型" />
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

        {/* 模型卡片网格 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {isLoading ? (
            <ModelCardSkeleton count={5} />
          ) : filteredModels.length > 0 ? (
            filteredModels.map((model) => <ModelCard key={model.id} model={model} />)
          ) : (
            <div className="col-span-1 flex h-36.5 items-center justify-center gap-4 sm:col-span-2 lg:col-span-3 xl:col-span-4 2xl:col-span-5">
              <span className="text-muted-foreground text-sm">
                {queryParams.name || queryParams.modelType
                  ? "没有找到符合条件的模型"
                  : "暂无模型数据"}
              </span>
            </div>
          )}
        </div>

        {/* 统计信息 */}
        {!isLoading && (
          <div className="text-sm text-muted-foreground">
            共 {filteredModels.length} 个模型
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default ModelIndexPage;
