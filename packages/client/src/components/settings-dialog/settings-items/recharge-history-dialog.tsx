"use client";

import { type RechargeListItem, useRechargeListsQuery } from "@buildingai/services/web";
import { Badge } from "@buildingai/ui/components/ui/badge";
import { Button } from "@buildingai/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@buildingai/ui/components/ui/dialog";
import { ScrollArea } from "@buildingai/ui/components/ui/scroll-area";
import { Skeleton } from "@buildingai/ui/components/ui/skeleton";
import { TimeText } from "@buildingai/ui/components/ui/time-text";
import { ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import { useState } from "react";

const PAGE_SIZE = 10;

export function RechargeHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useRechargeListsQuery(
    { page, pageSize: PAGE_SIZE },
    { enabled: open },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setPage(1);
        onOpenChange(v);
      }}
    >
      <DialogContent className="flex flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>充值记录</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 px-4 pt-3 pb-4">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <>
              <ScrollArea className="h-[50vh]">
                {items.length === 0 ? (
                  <div className="text-muted-foreground py-10 text-center text-sm">
                    暂无充值记录
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 py-1">
                    {items.map((item: RechargeListItem) => (
                      <div
                        key={item.id}
                        className="bg-card flex items-start justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <div className="bg-primary/10 text-primary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
                            <CreditCard className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium tabular-nums">
                                +{item.totalPower} 积分
                              </span>
                              {item.givePower > 0 && (
                                <Badge variant="secondary" className="text-[10px]">
                                  含赠送 {item.givePower}
                                </Badge>
                              )}
                              {item.refundStatus === 1 && (
                                <Badge variant="destructive" className="text-[10px]">
                                  已退款
                                </Badge>
                              )}
                            </div>
                            <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                              <span>{item.payTypeDesc}</span>
                              <span>·</span>
                              <TimeText format="YYYY/MM/DD HH:mm" value={item.createdAt} />
                            </div>
                            <div className="text-muted-foreground mt-0.5 text-xs">
                              订单号：{item.orderNo}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold tabular-nums">
                            ¥{Number(item.orderAmount).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">
                    共 {total} 条，第 {page}/{totalPages} 页
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-7"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-7"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
