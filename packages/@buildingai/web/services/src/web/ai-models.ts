import type { AiModel, AiProvider } from "@buildingai/db/entities";
import { useQuery } from "@tanstack/react-query";

import { apiHttpClient } from "../base";

export interface AiModelWithProvider extends AiModel {
  provider?: AiProvider;
}

/**
 * 获取 AI 模型列表查询
 */
export const useAiModelsListQuery = () => {
  return useQuery({
    queryKey: ["ai-models-list"],
    queryFn: async () => {
      const response = await apiHttpClient.get<AiModelWithProvider[]>("/ai-models");
      return response;
    },
  });
};
