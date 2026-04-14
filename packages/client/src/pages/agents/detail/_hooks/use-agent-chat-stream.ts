import { useChat } from "@ai-sdk/react";
import { useAuthStore } from "@buildingai/stores";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatStatus, FileUIPart, UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { validate as isUUID } from "uuid";

import { getApiBaseUrl } from "@/utils/api";

export interface UseAgentChatStreamOptions {
  agentId: string;
  saveConversation?: boolean;
  isDebug?: boolean;
  formVariables?: Record<string, string>;
  formFieldsInputs?: Record<string, unknown>;
  feature?: Record<string, boolean>;
  lastMessageDbIdRef: React.RefObject<string | null>;
  pendingParentIdRef: React.RefObject<string | null>;
  conversationIdRef: React.RefObject<string | undefined>;
  routeConversationId?: string;
  disableAutoNavigate?: boolean;
}

export interface UseAgentChatStreamReturn {
  conversationId: string | undefined;
  messages: UIMessage[];
  status: ChatStatus;
  streamingMessageId: string | null;
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
  regenerate: (messageId: string) => void;
  send: (
    content: string,
    parentId?: string | null,
    files?: Array<{ type: "file"; url: string; mediaType?: string; filename?: string }>,
  ) => void;
  stop: () => void;
  addToolApprovalResponse?: (args: { id: string; approved: boolean; reason?: string }) => void;
  getDbMessageId: (clientMessageId: string) => string | undefined;
}

export function useAgentChatStream(options: UseAgentChatStreamOptions): UseAgentChatStreamReturn {
  const {
    agentId,
    saveConversation = true,
    isDebug = false,
    formVariables,
    formFieldsInputs,
    feature,
    lastMessageDbIdRef,
    pendingParentIdRef,
    conversationIdRef,
    routeConversationId,
    disableAutoNavigate = false,
  } = options;

  const token = useAuthStore((state) => state.auth.token);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [conversationIdState, setConversationIdState] = useState<string | undefined>(undefined);
  const formVariablesRef = useRef(formVariables);
  const formFieldsInputsRef = useRef(formFieldsInputs);
  const featureRef = useRef<Record<string, boolean> | undefined>(feature);
  const messageDbIdMapRef = useRef<Map<string, string>>(new Map());
  const pendingUserDbIdRef = useRef<string | null>(null);
  const pendingAssistantDbIdRef = useRef<string | null>(null);
  const [statusOverride, setStatusOverride] = useState<ChatStatus | null>(null);
  useEffect(() => {
    formVariablesRef.current = formVariables;
    formFieldsInputsRef.current = formFieldsInputs;
  }, [formVariables, formFieldsInputs]);
  useEffect(() => {
    featureRef.current = feature;
  }, [feature]);

  const resolveMessageDbId = useCallback(
    (messageId: string | null | undefined): string | undefined => {
      if (!messageId) return undefined;
      return (
        messageDbIdMapRef.current.get(messageId) ?? (isUUID(messageId) ? messageId : undefined)
      );
    },
    [],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${getApiBaseUrl()}/api/ai-agents/${agentId}/chat/stream`,
        headers: { Authorization: token ? `Bearer ${token}` : "" },
        body: () => {
          const parentId = pendingParentIdRef.current;
          pendingParentIdRef.current = null;
          const fv = formVariablesRef.current;
          const ffi = formFieldsInputsRef.current;
          const currentFeature = featureRef.current;
          const currentConversationId = conversationIdRef.current;
          return {
            conversationId:
              currentConversationId && isUUID(currentConversationId)
                ? currentConversationId
                : undefined,
            ...(saveConversation === false && { saveConversation: false }),
            ...(isDebug && { isDebug: true }),
            ...(fv && Object.keys(fv).length > 0 && { formVariables: fv }),
            ...(ffi && Object.keys(ffi).length > 0 && { formFieldsInputs: ffi }),
            ...(currentFeature &&
              Object.keys(currentFeature).length > 0 && { feature: currentFeature }),
            ...(parentId !== undefined && parentId !== null && { parentId }),
          };
        },
        prepareSendMessagesRequest(request) {
          const lastMessage = request.messages.at(-1);
          const isToolApprovalContinuation = request.messages.some((msg) =>
            msg.parts?.some((part) => {
              const state = (part as { state?: string }).state;
              return state === "approval-responded" || state === "output-denied";
            }),
          );
          return {
            body: {
              ...request.body,
              ...(isToolApprovalContinuation
                ? { message: lastMessage }
                : { messages: request.messages }),
            },
          };
        },
      }),
    [agentId, token, saveConversation, isDebug],
  );

  const {
    messages,
    setMessages: setChatMessages,
    sendMessage,
    stop,
    status,
    regenerate,
    addToolApprovalResponse,
  } = useChat({
    id: `agent-chat-${agentId}`,
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      const lastMessage = currentMessages.at(-1);
      const shouldContinue =
        lastMessage?.parts?.some(
          (part) =>
            "state" in part &&
            part.state === "approval-responded" &&
            "approval" in part &&
            (part.approval as { approved?: boolean })?.approved === true,
        ) ?? false;
      return shouldContinue;
    },
    transport,
    onData: (data) => {
      if (data.type === "data-conversation-id" && data.data) {
        const id = data.data as string;
        if (isUUID(id)) {
          const isNewConversation = !conversationIdRef.current;
          conversationIdRef.current = id;
          setConversationIdState(id);
          if (isNewConversation && !disableAutoNavigate) {
            navigate(`/agents/${agentId}/c/${id}`, { replace: true });
            queryClient.invalidateQueries({ queryKey: ["agents", "chat", "conversations"] });
          }
        }
      }
      if (data.type === "data-user-message-id" && data.data) {
        lastMessageDbIdRef.current = data.data as string;
        pendingUserDbIdRef.current = data.data as string;
      }
      if (data.type === "data-assistant-message-id" && data.data) {
        lastMessageDbIdRef.current = data.data as string;
        pendingAssistantDbIdRef.current = data.data as string;
      }
    },
    onError: (error) => {
      console.error("Agent chat stream error:", error);
      const message = error?.message || "Unknown error";
      setStatusOverride("error");
      setChatMessages((prev) => {
        if (prev.length === 0) return prev;
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        const lastMessage = updated[lastIndex];
        if (lastMessage && lastMessage.role === "assistant") {
          updated[lastIndex] = {
            ...lastMessage,
            parts: [
              ...(lastMessage.parts || []),
              {
                type: "data-error",
                data: message,
              },
            ],
          };
          return updated;
        }
        // If the stream fails before an assistant message is created,
        // insert a synthetic assistant error message so the UI can display it.
        updated.push({
          id: crypto.randomUUID(),
          role: "assistant",
          parts: [{ type: "data-error", data: message }],
        });
        return updated;
      });
    },
  });

  const handleRegenerate = useCallback(
    (messageId: string) => {
      setStatusOverride(null);
      const msgIndex = messages.findIndex(
        (m) => m.id === messageId || resolveMessageDbId(m.id) === messageId,
      );
      if (msgIndex < 0) return;

      const msg = messages[msgIndex];
      if (msg.role === "user") {
        pendingParentIdRef.current = resolveMessageDbId(msg.id) ?? null;
      } else if (msgIndex > 0 && messages[msgIndex - 1].role === "user") {
        pendingParentIdRef.current = resolveMessageDbId(messages[msgIndex - 1].id) ?? null;
      }

      regenerate({
        messageId: msg.id,
        body: { trigger: "regenerate-message" },
      });
    },
    [regenerate, messages, resolveMessageDbId],
  );

  const send = useCallback(
    (
      content: string,
      parentId?: string | null,
      files?: Array<{ type: "file"; url: string; mediaType?: string; filename?: string }>,
    ) => {
      if (status === "streaming") return;
      if (!content.trim() && (!files || files.length === 0)) return;
      setStatusOverride(null);
      pendingParentIdRef.current =
        parentId !== undefined
          ? (resolveMessageDbId(parentId) ?? null)
          : lastMessageDbIdRef.current;

      const fileParts: FileUIPart[] | undefined =
        files && files.length > 0
          ? files.map((file) => ({
              type: "file" as const,
              url: file.url,
              mediaType: file.mediaType || "application/octet-stream",
              ...(file.filename && { filename: file.filename }),
            }))
          : undefined;

      sendMessage({
        text: content.trim() || "",
        ...(fileParts && { files: fileParts }),
      });
    },
    [sendMessage, status, lastMessageDbIdRef, resolveMessageDbId],
  );

  const streamingMessageId =
    status === "streaming" && messages.length > 0
      ? messages[messages.length - 1]?.id || null
      : null;

  useEffect(() => {
    if (messages.length === 0) {
      setStatusOverride(null);
    }
  }, [messages.length]);

  useEffect(() => {
    if (messages.length === 0) {
      messageDbIdMapRef.current.clear();
      pendingUserDbIdRef.current = null;
      pendingAssistantDbIdRef.current = null;
      return;
    }

    const last = messages[messages.length - 1];
    const lastUserIndex = [...messages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(({ message }: { message: UIMessage }) => message.role === "user")?.index;
    if (lastUserIndex !== undefined && pendingUserDbIdRef.current) {
      messageDbIdMapRef.current.set(messages[lastUserIndex].id, pendingUserDbIdRef.current);
      pendingUserDbIdRef.current = null;
    }
    if (last?.role === "assistant" && pendingAssistantDbIdRef.current) {
      messageDbIdMapRef.current.set(last.id, pendingAssistantDbIdRef.current);
      pendingAssistantDbIdRef.current = null;
    }
  }, [messages]);

  const getDbMessageId = useCallback((clientMessageId: string): string | undefined => {
    return messageDbIdMapRef.current.get(clientMessageId);
  }, []);

  const resolvedConversationId =
    routeConversationId && isUUID(routeConversationId)
      ? routeConversationId
      : (conversationIdState ??
        (conversationIdRef.current && isUUID(conversationIdRef.current)
          ? conversationIdRef.current
          : undefined));

  const effectiveStatus = statusOverride ?? status;

  return {
    conversationId: resolvedConversationId,
    messages,
    status: effectiveStatus,
    streamingMessageId,
    setMessages: setChatMessages,
    send,
    stop,
    regenerate: handleRegenerate,
    addToolApprovalResponse,
    getDbMessageId,
  };
}
