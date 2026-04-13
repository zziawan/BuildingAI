import type { ApiKey } from "@buildingai/db/entities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiHttpClient } from "../base";

export type CreateApiKeyRequest = {
  name: string;
};

export type CreateApiKeyResponse = ApiKey;

export type UpdateApiKeyRequest = {
  name?: string;
};

export type UpdateApiKeyResponse = ApiKey;

/**
 * 获取 API Keys 查询
 */
export const useApiKeysQuery = () => {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const response = await apiHttpClient.get<ApiKey[]>("/api-keys");
      return response;
    },
  });
};

/**
 * 创建 API Key 突变
 */
export const useCreateApiKeyMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateApiKeyRequest) => {
      const response = await apiHttpClient.post<CreateApiKeyResponse>("/api-keys", data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
};

/**
 * 更新 API Key 突变
 */
export const useUpdateApiKeyMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateApiKeyRequest }) => {
      const response = await apiHttpClient.patch<UpdateApiKeyResponse>(`/api-keys/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
};

/**
 * 删除 API Key 突变
 */
export const useDeleteApiKeyMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiHttpClient.delete(`/api-keys/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
};