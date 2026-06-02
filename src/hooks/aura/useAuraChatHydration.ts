import React, { useEffect, useMemo, useRef, useState } from "react";

import type { AIMessage } from "@/src/components/ai/chatTypes";
import {
  loadChatMessages,
  loadRecentChatThreads,
  type AIChatThread,
} from "@/src/lib/aiChats";
import { orderChatMessages } from "@/src/lib/chatMessageOrder";
import {
  getCachedChatList,
  getCachedRecentMessages,
  setCachedRecentMessages,
} from "@/src/lib/localCache";
import {
  isAuraChatSessionFresh,
  loadAuraChatSessionMeta,
  loadLatestChatCache,
  saveAuraChatSessionMeta,
  saveLatestChatCache,
} from "@/src/lib/localChatCache";

type UseAuraChatHydrationOptions = {
  uid: string | null;
  routeChatId: string;
  routeChatKey: string;
  recentChatLimit: number;
  defaultChips: string[];
  debug: boolean;
};

const PENDING_STREAM_TIMEOUT_MS = 120_000;
const INTERRUPTED_STREAM_MESSAGE =
  "AURA was interrupted before it finished. Try again to regenerate this response.";

function recoverStaleStreamingMessages(messages: AIMessage[]) {
  const now = Date.now();
  return orderChatMessages(messages).map((message) => {
    if (!message.streaming || message.type !== "assistant") return message;
    const createdAt =
      typeof message.createdAt === "number"
        ? message.createdAt
        : typeof message.clientCreatedAt === "number"
          ? message.clientCreatedAt
          : now;
    if (now - createdAt < PENDING_STREAM_TIMEOUT_MS) return message;
    return {
      ...message,
      type: "system/action" as const,
      kind: "system" as const,
      text: INTERRUPTED_STREAM_MESSAGE,
      assistantIntroText: undefined,
      aura: undefined,
      agentResponse: undefined,
      outfits: undefined,
      streaming: false,
    };
  });
}

function messageSignature(messages: AIMessage[]) {
  return messages
    .map((message) =>
      [
        message.id,
        message.type,
        message.kind ?? "",
        message.createdAt ?? "",
        message.clientCreatedAt ?? "",
        message.streaming ? "streaming" : "done",
        message.aura?.lookOptions?.length ?? 0,
        message.aura?.look ? 1 : 0,
        message.agentResponse?.outfits?.length ?? 0,
        message.agentResponse?.mode ?? "",
      ].join("|"),
    )
    .join("::");
}

function shouldReplaceMessages(current: AIMessage[], next: AIMessage[]) {
  return messageSignature(current) !== messageSignature(next);
}

export function useAuraChatHydration({
  uid,
  routeChatId,
  routeChatKey,
  recentChatLimit,
  defaultChips,
  debug,
}: UseAuraChatHydrationOptions) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [, setQuickChips] = useState<string[]>(defaultChips);
  const [recentThreads, setRecentThreads] = useState<AIChatThread[]>([]);
  const latestMessagesRef = useRef<AIMessage[]>([]);
  const lastHydratedUidRef = useRef<string | null>(null);
  const consumedChatTokens = useRef(new Set<string>());
  const orderedMessages = useMemo(() => orderChatMessages(messages), [messages]);
  const hasStreamingMessage = useMemo(() => orderedMessages.some((entry) => entry.streaming), [orderedMessages]);

  useEffect(() => {
    latestMessagesRef.current = orderedMessages;
  }, [orderedMessages]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!uid) {
        setMessages([]);
        setActiveChatId(null);
        setRecentThreads([]);
        lastHydratedUidRef.current = null;
        setIsBooting(false);
        return;
      }

      if (lastHydratedUidRef.current !== uid) {
        setMessages([]);
        setActiveChatId(null);
        setRecentThreads([]);
        lastHydratedUidRef.current = uid;
      }
      setIsBooting(true);

      const cachedThreads = await getCachedChatList(uid);
      if (!cancelled && cachedThreads?.data?.length) {
        setRecentThreads(cachedThreads.data);
      }

      try {
        const shouldLoadSpecificChat =
          !!routeChatId && !consumedChatTokens.current.has(`${routeChatKey}:${routeChatId}`);
        if (shouldLoadSpecificChat) {
          consumedChatTokens.current.add(`${routeChatKey}:${routeChatId}`);
          const cachedMessages = await getCachedRecentMessages(uid, routeChatId);
          if (!cancelled && cachedMessages?.data?.length) {
            setMessages(recoverStaleStreamingMessages(cachedMessages.data));
            setActiveChatId(routeChatId);
            setIsBooting(false);
          }
          const [threadMessages, recent] = await Promise.all([
            loadChatMessages(uid, routeChatId),
            loadRecentChatThreads(uid, recentChatLimit),
          ]);
          if (!cancelled) {
            const orderedThreadMessages = recoverStaleStreamingMessages(threadMessages);
            if (shouldReplaceMessages(latestMessagesRef.current, orderedThreadMessages)) {
              setMessages(orderedThreadMessages);
            }
            setActiveChatId(routeChatId);
            setQuickChips(defaultChips);
            setRecentThreads(recent);
            await saveAuraChatSessionMeta(uid, routeChatId);
            await saveLatestChatCache(uid, routeChatId, null, orderedThreadMessages);
          }
          return;
        }

        const session = await loadAuraChatSessionMeta(uid);
        if (isAuraChatSessionFresh(session) && session?.chatId) {
          let renderedCachedMessages = false;
          const cachedMessages = await getCachedRecentMessages(uid, session.chatId);
          if (!cancelled && cachedMessages?.data?.length) {
            setMessages(recoverStaleStreamingMessages(cachedMessages.data));
            setActiveChatId(session.chatId);
            setIsBooting(false);
            renderedCachedMessages = true;
          }

          if (!renderedCachedMessages) {
            const cachedLatest = await loadLatestChatCache<AIMessage>(uid);
            if (!cancelled && cachedLatest?.chatId === session.chatId && cachedLatest.messages.length) {
              setMessages(recoverStaleStreamingMessages(cachedLatest.messages));
              setActiveChatId(session.chatId);
              setIsBooting(false);
              renderedCachedMessages = true;
            }
          }

          if (!cancelled && !renderedCachedMessages) {
            setMessages([]);
            setActiveChatId(session.chatId);
            setIsBooting(false);
          }

          await saveAuraChatSessionMeta(uid, session.chatId);
          const [recent, threadMessages] = await Promise.all([
            loadRecentChatThreads(uid, recentChatLimit),
            loadChatMessages(uid, session.chatId),
          ]);
          if (!cancelled) {
            const orderedThreadMessages = recoverStaleStreamingMessages(threadMessages);
            setRecentThreads(recent);
            setActiveChatId(session.chatId);
            if (shouldReplaceMessages(latestMessagesRef.current, orderedThreadMessages)) {
              setMessages(orderedThreadMessages);
            }
            await saveLatestChatCache(uid, session.chatId, null, orderedThreadMessages);
          }
          return;
        }

        const cachedLatest = session ? null : await loadLatestChatCache<AIMessage>(uid);
        if (
          cachedLatest?.chatId &&
          isAuraChatSessionFresh({
            chatId: cachedLatest.chatId,
            openedAt: cachedLatest.updatedAt ?? 0,
          })
        ) {
          const orderedCachedMessages = recoverStaleStreamingMessages(cachedLatest.messages);
          if (!cancelled) {
            setMessages(orderedCachedMessages);
            setActiveChatId(cachedLatest.chatId);
            setIsBooting(false);
          }
          await saveAuraChatSessionMeta(uid, cachedLatest.chatId);
          const [recent, threadMessages] = await Promise.all([
            loadRecentChatThreads(uid, recentChatLimit),
            loadChatMessages(uid, cachedLatest.chatId),
          ]);
          if (!cancelled) {
            const orderedThreadMessages = recoverStaleStreamingMessages(threadMessages);
            setRecentThreads(recent);
            setActiveChatId(cachedLatest.chatId);
            if (shouldReplaceMessages(latestMessagesRef.current, orderedThreadMessages)) {
              setMessages(orderedThreadMessages);
            }
            await saveLatestChatCache(uid, cachedLatest.chatId, null, orderedThreadMessages);
          }
          return;
        }

        if (!cancelled) {
          setMessages([]);
          setActiveChatId(null);
          setQuickChips(defaultChips);
          setIsBooting(false);
        }
        await saveAuraChatSessionMeta(uid, null);
        const recent = await loadRecentChatThreads(uid, recentChatLimit);
        if (!cancelled) {
          setRecentThreads(recent);
        }
      } catch (error) {
        if (debug) {
          console.log("[AURA] hydrate failed", error);
        }
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [debug, defaultChips, recentChatLimit, routeChatId, routeChatKey, uid]);

  useEffect(() => {
    if (isBooting) return;
    if (!uid) return;
    if (hasStreamingMessage) return;
    if (activeChatId) {
      void setCachedRecentMessages(uid, activeChatId, orderedMessages);
      void saveLatestChatCache(uid, activeChatId, null, orderedMessages);
      void saveAuraChatSessionMeta(uid, activeChatId);
    } else if (orderedMessages.length === 0) {
      void saveAuraChatSessionMeta(uid, null);
    }
  }, [activeChatId, hasStreamingMessage, isBooting, orderedMessages, uid]);

  const refreshRecentThreads = React.useCallback(async () => {
    if (!uid) return [];
    const recent = await loadRecentChatThreads(uid, recentChatLimit);
    setRecentThreads(recent);
    return recent;
  }, [recentChatLimit, uid]);

  return {
    activeChatId,
    hasStreamingMessage,
    isBooting,
    latestMessagesRef,
    messages,
    orderedMessages,
    recentThreads,
    refreshRecentThreads,
    setActiveChatId,
    setMessages,
    setQuickChips,
    setRecentThreads,
  };
}
