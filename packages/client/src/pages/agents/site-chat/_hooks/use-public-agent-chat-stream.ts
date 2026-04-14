import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatStatus, FileUIPart, UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { validate as isUUID } from "uuid";

import { getApiBaseUrl } from "@/utils/api";

export interface UsePublicAgentChatStreamOptions {
  agentId: string;
  accessToken: string;
  anonymousIdentifier?: string;
  initialConversationId?: string;
  saveConversation?: boolean;
  formVariables?: Record<string, string> | undefined;
  formFieldsInputs?: Record<string, unknown> | undefined;
}

export interface UsePublicAgentChatStreamReturn {
  conversationId: string | undefined;
  messages: UIMessage[];
  status: ChatStatus;
  streamingMessageId: string | null;
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
  send: (
    content: string,
    files?: Array<{ type: "file"; url: string; mediaType?: string; filename?: string }>,
  ) => void;
  sendWithParent: (
    content: string,
    parentIdClientOrDb: string | null | undefined,
    files?: Array<{ type: "file"; url: string; mediaType?: string; filename?: string }>,
  ) => void;
  stop: () => void;
  addToolApprovalResponse?: (args: { id: string; approved: boolean; reason?: string }) => void;
  regenerate: (messageId: string) => void;
  getDbMessageId: (clientMessageId: string) => string | undefined;
}

export function usePublicAgentChatStream(
  options: UsePublicAgentChatStreamOptions,
): UsePublicAgentChatStreamReturn {
  const {
    agentId,
    accessToken,
    anonymousIdentifier,
    initialConversationId,
    saveConversation = true,
    formVariables,
    formFieldsInputs,
  } = options;

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const conversationIdRef = useRef<string | undefined>(
    initialConversationId && isUUID(initialConversationId) ? initialConversationId : undefined,
  );
  const [conversationIdState, setConversationIdState] = useState<string | undefined>(
    initialConversationId && isUUID(initialConversationId) ? initialConversationId : undefined,
  );
  const prevInitialConversationIdRef = useRef<string | undefined>(
    initialConversationId && isUUID(initialConversationId) ? initialConversationId : undefined,
  );

  const hasInitialConversationId = Boolean(initialConversationId && isUUID(initialConversationId));
  const shouldNavigateRef = useRef(!hasInitialConversationId);
  useEffect(() => {
    shouldNavigateRef.current = !hasInitialConversationId;
  }, [hasInitialConversationId]);

  const formVariablesRef = useRef(formVariables);
  const formFieldsInputsRef = useRef(formFieldsInputs);
  useEffect(() => {
    formVariablesRef.current = formVariables;
  }, [formVariables]);
  useEffect(() => {
    formFieldsInputsRef.current = formFieldsInputs;
  }, [formFieldsInputs]);

  const pendingParentIdRef = useRef<string | null>(null);
  const messageDbIdMapRef = useRef<Map<string, string>>(new Map());
  const pendingUserDbIdRef = useRef<string | null>(null);
  const lastAssistantDbIdRef = useRef<string | null>(null);
  const pendingAssistantDbIdRef = useRef<string | null>(null);
  const [statusOverride, setStatusOverride] = useState<ChatStatus | null>(null);

  useEffect(() => {
    if (conversationIdState && isUUID(conversationIdState)) return;
    if (!initialConversationId || !isUUID(initialConversationId)) return;
    conversationIdRef.current = initialConversationId;
    setConversationIdState(initialConversationId);
  }, [initialConversationId, conversationIdState]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${getApiBaseUrl()}/v1/chat-messages`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(anonymousIdentifier ? { "X-Anonymous-Identifier": anonymousIdentifier } : {}),
        },
        body: () => {
          const parentId = pendingParentIdRef.current;
          pendingParentIdRef.current = null;
          const fv = formVariablesRef.current;
          const ffi = formFieldsInputsRef.current;
          const currentConversationId = conversationIdRef.current;
          return {
            conversationId:
              currentConversationId && isUUID(currentConversationId)
                ? currentConversationId
                : undefined,
            ...(saveConversation === false && { saveConversation: false }),
            ...(fv && Object.keys(fv).length > 0 && { formVariables: fv }),
            ...(ffi && Object.keys(ffi).length > 0 && { formFieldsInputs: ffi }),
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
    [accessToken, saveConversation, anonymousIdentifier],
  );

  const { messages, setMessages, sendMessage, stop, status, regenerate, addToolApprovalResponse } =
    useChat({
      id: `public-agent-chat-${agentId}-${accessToken}-${anonymousIdentifier ?? ""}`,
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
            const wasEmpty = !conversationIdRef.current;
            conversationIdRef.current = id;
            setConversationIdState(id);
            if (shouldNavigateRef.current && wasEmpty) {
              navigate(`/agents/${agentId}/${accessToken}/c/${id}`, { replace: true });
              queryClient.invalidateQueries({
                queryKey: [
                  "public-agent-conversations",
                  agentId,
                  accessToken,
                  anonymousIdentifier ?? "",
                ],
              });
            }
          }
        }

        if (data.type === "data-assistant-message-id" && data.data) {
          const id = data.data as string;
          if (isUUID(id)) {
            lastAssistantDbIdRef.current = id;
            pendingAssistantDbIdRef.current = id;
          }
        }

        if (data.type === "data-user-message-id" && data.data) {
          const id = data.data as string;
          if (isUUID(id)) pendingUserDbIdRef.current = id;
        }
      },
      onError: (error) => {
        console.error("Public agent chat stream error:", error);
        const message = (error as Error | undefined)?.message || "Unknown error";
        setStatusOverride("error");
        setMessages((prev) => {
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

  useEffect(() => {
    const nextConversationId =
      initialConversationId && isUUID(initialConversationId) ? initialConversationId : undefined;
    const prevConversationId = prevInitialConversationIdRef.current;

    if (prevConversationId === nextConversationId) return;
    prevInitialConversationIdRef.current = nextConversationId;

    conversationIdRef.current = nextConversationId;
    setConversationIdState(nextConversationId);

    if (!prevConversationId) return;

    stop();
    setMessages([]);
    pendingParentIdRef.current = null;
    lastAssistantDbIdRef.current = null;
  }, [initialConversationId, setMessages, stop]);

  const resolveMessageDbId = useCallback(
    (messageId: string | null | undefined): string | undefined => {
      if (!messageId) return undefined;
      const mapped = messageDbIdMapRef.current.get(messageId);
      if (mapped) return mapped;
      return isUUID(messageId) ? messageId : undefined;
    },
    [],
  );

  const getDbMessageId = useCallback(
    (clientMessageId: string): string | undefined => resolveMessageDbId(clientMessageId),
    [resolveMessageDbId],
  );

  useEffect(() => {
    if (messages.length === 0) {
      setStatusOverride(null);
      messageDbIdMapRef.current.clear();
      pendingUserDbIdRef.current = null;
      pendingAssistantDbIdRef.current = null;
      lastAssistantDbIdRef.current = null;
      return;
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    lastAssistantDbIdRef.current = lastAssistant?.id ?? null;

    const lastUser = [...messages]
      .map((m, index) => ({ m, index }))
      .reverse()
      .find(({ m }) => m.role === "user");

    if (lastUser && pendingUserDbIdRef.current) {
      messageDbIdMapRef.current.set(messages[lastUser.index].id, pendingUserDbIdRef.current);
      pendingUserDbIdRef.current = null;
    }

    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && pendingAssistantDbIdRef.current) {
      messageDbIdMapRef.current.set(last.id, pendingAssistantDbIdRef.current);
      pendingAssistantDbIdRef.current = null;
    }
  }, [messages]);

  const streamingMessageId =
    status === "streaming" && messages.length > 0 ? messages[messages.length - 1]?.id : null;

  const send = useCallback(
    (
      content: string,
      files?: Array<{ type: "file"; url: string; mediaType?: string; filename?: string }>,
    ) => {
      const text = content.trim();
      if (status === "streaming") return;
      if (!text && (!files || files.length === 0)) return;
      setStatusOverride(null);
      pendingParentIdRef.current = lastAssistantDbIdRef.current ?? null;

      const fileParts: FileUIPart[] | undefined =
        files && files.length > 0
          ? files.map((file) => ({
              type: "file" as const,
              url: file.url,
              mediaType: file.mediaType || "application/octet-stream",
              ...(file.filename ? { filename: file.filename } : {}),
            }))
          : undefined;

      sendMessage({
        text: text || "",
        ...(fileParts && { files: fileParts }),
      });
    },
    [status, sendMessage],
  );

  const sendWithParent = useCallback(
    (
      content: string,
      parentIdClientOrDb: string | null | undefined,
      files?: Array<{ type: "file"; url: string; mediaType?: string; filename?: string }>,
    ) => {
      const text = content.trim();
      if (status === "streaming") return;
      if (!text && (!files || files.length === 0)) return;
      setStatusOverride(null);

      const resolvedParentId = parentIdClientOrDb
        ? (resolveMessageDbId(parentIdClientOrDb) ?? null)
        : null;
      pendingParentIdRef.current = resolvedParentId;

      const fileParts: FileUIPart[] | undefined =
        files && files.length > 0
          ? files.map((file) => ({
              type: "file" as const,
              url: file.url,
              mediaType: file.mediaType || "application/octet-stream",
              ...(file.filename ? { filename: file.filename } : {}),
            }))
          : undefined;

      sendMessage({
        text: text || "",
        ...(fileParts && { files: fileParts }),
      });
    },
    [status, sendMessage, resolveMessageDbId],
  );

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
    [messages, regenerate, resolveMessageDbId],
  );

  return {
    conversationId: conversationIdState ?? conversationIdRef.current,
    messages,
    status: statusOverride ?? status,
    streamingMessageId,
    setMessages,
    send,
    sendWithParent,
    stop,
    addToolApprovalResponse,
    regenerate: handleRegenerate,
    getDbMessageId,
  };
}
