import { useAiModelsListQuery } from "@buildingai/services/web";
import { useAuthStore } from "@buildingai/stores";
import { BooleanNumber } from "@buildingai/constants/shared/status-codes.constant";
import { Badge } from "@buildingai/ui/components/ui/badge";
import { Button } from "@buildingai/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@buildingai/ui/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@buildingai/ui/components/ui/tabs";
import { ArrowLeft, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { PageContainer } from "@/layouts/console/_components/page-container";
import { ProviderAvatar } from "@/components/provider-avatar";
import { getApiBaseUrl } from "@/utils/api";

/**
 * 模型使用说明页面
 */
const ModelUsagePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [copiedParam, setCopiedParam] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"curl" | "python" | "nodejs">("curl");

  const { data: models = [], isLoading } = useAiModelsListQuery();
  const userInfo = useAuthStore((state) => state.auth.userInfo);
  
  const model = useMemo(() => {
    return models.find((m) => m.id === id);
  }, [models, id]);

  const hasModelAccessPermission = useMemo(() => {
    const permissionCodes = userInfo?.permissionsCodes ?? [];
    const isRoot = userInfo?.isRoot === BooleanNumber.YES;
    return isRoot || permissionCodes.includes("ai-models:list");
  }, [userInfo]);

  const isModelAvailable = (model: any) => {
    return (
      Boolean(model.isActive) &&
      Boolean(model.provider?.isActive) &&
      hasModelAccessPermission
    );
  };

  const handleCopy = (text: string, param: string) => {
    navigator.clipboard.writeText(text);
    setCopiedParam(param);
    setTimeout(() => setCopiedParam(null), 2000);
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <div>加载中...</div>
        </div>
      </PageContainer>
    );
  }

  if (!model) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-red-500 text-lg font-medium mb-2">模型不存在</div>
            <Button onClick={() => navigate(-1)} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  const apiBaseUrl = `${getApiBaseUrl()}/v1`;
  const endpointUrl = `${apiBaseUrl}/chat/completions`;
  
  // 生成代码示例
  const codeExamples = {
    curl: `curl -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "${model.id}",
    "messages": [
      {
        "role": "user",
        "content": "你好，请介绍一下你自己"
      }
    ],
    "stream": true
  }'`,

    python: `import requests
import json

base_url = "${apiBaseUrl}"
url = f"{base_url}/chat/completions"

headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY"
}

payload = {
    "model": "${model.id}",
    "messages": [
        {
            "role": "user",
            "content": "你好，请介绍一下你自己"
        }
    ],
    "stream": True
}

response = requests.post(url, headers=headers, json=payload, stream=True)
response.raise_for_status()

for line in response.iter_lines():
    if line:
        print(line.decode("utf-8"))`,

    nodejs: `const fetch = require('node-fetch');

const baseURL = '${apiBaseUrl}';
  const url = baseURL + '/chat/completions';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer YOUR_API_KEY'
};

const payload = {
  model: '${model.id}',
  messages: [
    {
      role: 'user',
      content: '你好，请介绍一下你自己'
    }
  ],
  stream: true
};

async function callModel() {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Request failed: ' + response.status + ' ' + response.statusText);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log(decoder.decode(value));
  }
}

callModel().catch(console.error);`
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* 返回按钮和标题 */}
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate(-1)} variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回列表
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{model.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              模型调用说明文档
            </p>
          </div>
        </div>

        {/* 模型基本信息 */}
        <div className="border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <ProviderAvatar
              provider={model.providerId}
              iconUrl={model.provider?.iconUrl}
              name={model.name}
              size="md"
            />
            <span className="text-lg font-semibold">{model.name}</span>
            <Badge variant="outline">{model.modelType || "llm"}</Badge>
            <Badge variant={isModelAvailable(model) ? "default" : "secondary"}>
              {isModelAvailable(model) ? "可用" : "不可用"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            提供商：{model.provider?.name} | 
            价格：{!model.billingRule?.power ? "免费" : `${model.billingRule.power} 积分 / ${model.billingRule.tokens} tokens`}
          </p>
        </div>

        {/* 模型调用参数说明 */}
        <div className="border rounded-lg">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">模型调用参数说明</h2>
            <p className="text-sm text-muted-foreground mt-2">
              以下参数基于 OpenAI 兼容接口 `POST /v1/chat/completions`。平台会对模型调用进行用户认证、计量计费，并统一处理并发与安全控制。
            </p>
          </div>
          <div className="p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/4">参数名称</TableHead>
                  <TableHead>参数值</TableHead>
                  <TableHead className="w-32">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">baseURL</TableCell>
                  <TableCell className="font-mono text-sm break-all">{apiBaseUrl}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(apiBaseUrl, "baseURL")}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {copiedParam === "baseURL" ? "已复制" : "复制"}
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">endpoint</TableCell>
                  <TableCell className="font-mono text-sm break-all">{endpointUrl}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(endpointUrl, "endpoint")}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {copiedParam === "endpoint" ? "已复制" : "复制"}
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">model</TableCell>
                  <TableCell className="font-mono text-sm break-all">{model.id}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(model.id, "model")}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {copiedParam === "model" ? "已复制" : "复制"}
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Authorization</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground break-all">
                        `Bearer YOUR_API_KEY`（请前往 API Keys 页面获取）
                      </span>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto"
                        onClick={() => navigate("/modelapi")}
                      >
                        查看 API Keys
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">无需复制</span>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">messages</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    OpenAI 标准消息数组，至少包含一条消息，例如 `[{'{'} role: "user", content: "你好" {'}'}]`
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">请求体参数</span>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">stream</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    可选，默认 `true`；设置为 `false` 时返回非流式完整响应
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">请求体参数</span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        {/* 调用示例 */}
        <div className="border rounded-lg">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">调用示例</h2>
            <p className="text-sm text-muted-foreground mt-2">
              以下是使用不同编程语言调用该模型的示例代码
            </p>
          </div>
          <div className="p-6">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "curl" | "python" | "nodejs")}>
              <TabsList className="w-fit">
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="nodejs">Node.js</TabsTrigger>
              </TabsList>
              <div className="mt-4">
                <TabsContent value="curl" className="mt-0">
                  <div className="bg-muted p-4 rounded-md overflow-x-auto">
                    <pre className="text-xs">
                      <code>{codeExamples.curl}</code>
                    </pre>
                  </div>
                </TabsContent>
                <TabsContent value="python" className="mt-0">
                  <div className="bg-muted p-4 rounded-md overflow-x-auto">
                    <pre className="text-xs">
                      <code>{codeExamples.python}</code>
                    </pre>
                  </div>
                </TabsContent>
                <TabsContent value="nodejs" className="mt-0">
                  <div className="bg-muted p-4 rounded-md overflow-x-auto">
                    <pre className="text-xs">
                      <code>{codeExamples.nodejs}</code>
                    </pre>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default ModelUsagePage;
