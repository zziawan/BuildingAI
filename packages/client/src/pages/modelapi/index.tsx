import {
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useDeleteApiKeyMutation,
} from "@buildingai/services/web";
import { Button } from "@buildingai/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@buildingai/ui/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { ApiKeyCreatedDialog } from "@/components/api-key-created-dialog";
import { CreateApiKeyDialog } from "./_components/create-api-key-dialog";

/**
 * API Keys 页面
 */
const ApiKeysPage = () => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<{ name: string; key: string } | null>(null);
  const { data: apiKeys = [], refetch } = useApiKeysQuery();
  const createApiKeyMutation = useCreateApiKeyMutation();
  const deleteApiKeyMutation = useDeleteApiKeyMutation();

  const handleCreate = async (name: string) => {
    const created = await createApiKeyMutation.mutateAsync({ name });
    setCreatedApiKey({ name: created.name, key: created.key });
    refetch();
    setCreateDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm("确定要删除这个 API Key 吗？")) {
      await deleteApiKeyMutation.mutateAsync(id);
      refetch();
    }
  };

  return (
    <div className="h-full p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">API keys</h1>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            创建 API Key
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead>最近使用时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.map((apiKey) => (
              <TableRow key={apiKey.id}>
                <TableCell>{apiKey.name}</TableCell>
                <TableCell className="font-mono text-sm">
                  {apiKey.maskedKey}
                </TableCell>
                <TableCell>
                  {new Date(apiKey.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  {apiKey.lastUsedAt
                    ? new Date(apiKey.lastUsedAt).toLocaleString()
                    : "从未使用"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(apiKey.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <CreateApiKeyDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onCreate={handleCreate}
        />
        <ApiKeyCreatedDialog
          open={!!createdApiKey}
          onOpenChange={(open) => {
            if (!open) {
              setCreatedApiKey(null);
            }
          }}
          apiKeyName={createdApiKey?.name ?? ""}
          apiKeyValue={createdApiKey?.key ?? ""}
        />
    </div>
  );
};

export default ApiKeysPage;