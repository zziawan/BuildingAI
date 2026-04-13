import { useApiKeysQuery, useCreateApiKeyMutation, useDeleteApiKeyMutation } from "@buildingai/services/web";
import { useAuthStore } from "@buildingai/stores";
import type { ApiKey } from "@buildingai/db/entities";
import { Button } from "@buildingai/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@buildingai/ui/components/ui/table";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/layouts/console/_components/page-container";
import { CreateApiKeyDialog } from "./_components/create-api-key-dialog";

/**
 * API Keys 管理页面
 */
const ApiKeyIndexPage = () => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [, setCopiedId] = useState<string | null>(null);
  const { data: apiKeys = [], isLoading, error, refetch } = useApiKeysQuery();
  const createApiKeyMutation = useCreateApiKeyMutation();
  const deleteApiKeyMutation = useDeleteApiKeyMutation();
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
              请先登录后再访问API密钥管理页面
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
    console.error('API Keys query error:', error);
    
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
                请先登录后再访问API密钥管理页面
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

  const handleCreate = async (name: string) => {
    await createApiKeyMutation.mutateAsync({ name });
    refetch();
    setCreateDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm("确定要删除这个 API Key 吗？")) {
      await deleteApiKeyMutation.mutateAsync(id);
      refetch();
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
            <p className="text-gray-500 mt-1">管理和生成 API Keys 用于访问平台api</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            生成新 API Key
          </Button>
        </div>

        {apiKeys.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-gray-500">暂无 API Key，点击"生成新 API Key"创建一个</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>最近使用时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((apiKey: ApiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell className="font-medium">{apiKey.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-gray-100 px-2 py-1 text-sm font-mono">
                          {apiKey.key.slice(0, 8)}...{apiKey.key.slice(-8)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(apiKey.key, apiKey.id)}
                          title="复制完整 key"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(apiKey.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell>
                      {apiKey.lastUsedAt
                        ? new Date(apiKey.lastUsedAt).toLocaleString("zh-CN")
                        : "从未使用"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(apiKey.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <CreateApiKeyDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onCreate={handleCreate}
        />
      </div>
    </PageContainer>
  );
};

export default ApiKeyIndexPage;