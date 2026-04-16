import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiHttpClient } from "../base";

export type ApiKeyListItem = {
  id: string;
  name: string;
  maskedKey: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type CreateApiKeyRequest = {
  name: string;
};

export type CreateApiKeyResponse = ApiKeyListItem & {
  key: string;
};

export type UpdateApiKeyRequest = {
  name?: string;
};

export type UpdateApiKeyResponse = ApiKeyListItem;

/**
 * 获取 API Keys 查询
 */
export const useApiKeysQuery = () => {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const response = await apiHttpClient.get<ApiKeyListItem[]>("/api-keys");
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
    mutationFn: async ({ id, data }: { id: string; data: UpdateApiKeyRequest }) => {
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