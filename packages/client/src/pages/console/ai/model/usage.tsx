import { useAiModelsListQuery } from "@buildingai/services/web";
import { useAuthStore } from "@buildingai/stores";
import { BooleanNumber } from "@buildingai/constants/shared/status-codes.constant";
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
  ArrowLeft,
  Braces,
  Brain,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  ScanEye,
  Video,
  Waves,
  Workflow,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

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

  // 生成平台API基础URL (OpenAI compatible format)
  const baseUrl = `${window.location.origin}/api/web/ai-models/chat`;
  
  // 生成代码示例
  const codeExamples = {
    curl: `curl -X POST "${baseUrl}" \\
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

url = "${baseUrl}"

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

response = requests.post(url, headers=headers, json=payload)

# 处理流式响应
for line in response.iter_lines():
    if line:
        print(line.decode('utf-8'))`,

    nodejs: `const fetch = require('node-fetch');

const url = '${baseUrl}';

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
    headers: headers,
    body: JSON.stringify(payload)
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log(decoder.decode(value));
  }
}

callModel();`
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
              以下是调用该模型所需的参数信息。请注意，baseurl为平台提供的模型调用接口，需要对模型调用进行用户认证、计量计费，具备并发安全高性能特性。
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
                  <TableCell className="font-medium">baseurl</TableCell>
                  <TableCell className="font-mono text-sm break-all">{baseUrl}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(baseUrl, "baseurl")}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {copiedParam === "baseurl" ? "已复制" : "复制"}
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">模型 ID</TableCell>
                  <TableCell className="font-mono text-sm break-all">{model.id}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(model.id, "modelId")}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {copiedParam === "modelId" ? "已复制" : "复制"}
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
                  <TableCell className="font-medium">usekey</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        API Key（请前往 API Keys 页面获取）
                      </span>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto"
                        onClick={() => navigate("/console/api-key")}
                      >
                        查看 API Keys
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      复制
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        {/* 模型调用实例 */}
        <div className="border rounded-lg">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">模型调用实例</h2>
            <p className="text-sm text-muted-foreground mt-2">
              以下是基于不同编程语言的调用示例代码
            </p>
          </div>
          <div className="p-6">
            {/* Tab Buttons */}
            <div className="flex gap-2 mb-4">
              <Button
                variant={activeTab === "curl" ? "default" : "outline"}
                onClick={() => setActiveTab("curl")}
              >
                cURL
              </Button>
              <Button
                variant={activeTab === "python" ? "default" : "outline"}
                onClick={() => setActiveTab("python")}
              >
                Python
              </Button>
              <Button
                variant={activeTab === "nodejs" ? "default" : "outline"}
                onClick={() => setActiveTab("nodejs")}
              >
                Node.js
              </Button>
            </div>

            {/* Code Display */}
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm min-h-[200px]">
                <code>{codeExamples[activeTab]}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => handleCopy(codeExamples[activeTab], activeTab)}
              >
                <Copy className="w-4 h-4 mr-2" />
                {copiedParam === activeTab ? "已复制" : "复制代码"}
              </Button>
            </div>
          </div>
        </div>

        {/* 注意事项 */}
        <div className="border rounded-lg border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-900">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-3">注意事项</h3>
            <ul className="space-y-2 text-yellow-800 dark:text-yellow-200">
              <li className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <span>baseurl为平台提供的模型调用接口，所有请求需要经过用户认证</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <span>系统会根据模型配置自动进行会员等级验证及账户积分验证</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <span>接口具备计量计费功能，根据实际使用的token数量扣除相应积分</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <span>平台接口具备并发安全和高性能特性，支持大规模并发调用</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <span>
                  请将示例代码中的 <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">YOUR_API_KEY</code> 替换为您的实际API Key
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default ModelUsagePage;
