import { useCopy } from "@buildingai/hooks";
import { Button } from "@buildingai/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@buildingai/ui/components/ui/dialog";
import { Input } from "@buildingai/ui/components/ui/input";
import { Copy } from "lucide-react";

type ApiKeyCreatedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKeyName: string;
  apiKeyValue: string;
};

export const ApiKeyCreatedDialog = ({
  open,
  onOpenChange,
  apiKeyName,
  apiKeyValue,
}: ApiKeyCreatedDialogProps) => {
  const { copy, isCopying } = useCopy();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API Key 已生成</DialogTitle>
          <DialogDescription>
            {`“${apiKeyName}” 的完整 API Key 仅会展示这一次，请立即复制并妥善保存。关闭后将无法再次查看明文。`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            请现在完成复制保存。数据库中已仅保存摘要，后续页面只会显示掩码。
          </div>
          <div className="flex items-center gap-2">
            <Input value={apiKeyValue} readOnly className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={() => copy(apiKeyValue)} disabled={isCopying}>
              <Copy className="mr-2 h-4 w-4" />
              {isCopying ? "复制中..." : "复制"}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            我已保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};