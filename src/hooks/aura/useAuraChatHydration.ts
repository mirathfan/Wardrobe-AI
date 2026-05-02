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
import { loadLatestChatCache, saveLatestChatCache } from "@/src/lib/localChatCache";

type UseAuraChatHydrationOptions = {
  uid: string | null;
  routeChatId: string;
  routeChatKey: string;
  recentChatLimit: number;
  defaultChips: string[];
  debug: boolean;
};

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

      const cachedActiveChatId = routeChatId || cachedThreads?.data?.find((thread) => !thread.archived)?.chatId || "";
      if (cachedActiveChatId) {
        const cachedMessages = await getCachedRecentMessages(uid, cachedActiveChatId);
        if (!cancelled && cachedMessages?.data?.length) {
          setMessages(orderChatMessages(cachedMessages.data));
          setActiveChatId(cachedActiveChatId);
        }
      } else {
        const cached = await loadLatestChatCache<AIMessage>(uid);
        if (!cancelled && cached?.messages?.length) {
          setMessages(orderChatMessages(cached.messages));
          setActiveChatId(cached.chatId ?? null);
        }
      }

      try {
        const shouldLoadSpecificChat =
          !!routeChatId && !consumedChatTokens.current.has(`${routeChatKey}:${routeChatId}`);
        if (shouldLoadSpecificChat) {
          consumedChatTokens.current.add(`${routeChatKey}:${routeChatId}`);
          const threadMessages = await loadChatMessages(uid, routeChatId);
          const recent = await loadRecentChatThreads(uid, recentChatLimit);
          if (!cancelled) {
            setMessages(orderChatMessages(threadMessages));
            setActiveChatId(routeChatId);
            setQuickChips(defaultChips);
            setRecentThreads(recent);
            await saveLatestChatCache(uid, routeChatId, null, threadMessages);
          }
          return;
        }

        const recent = await loadRecentChatThreads(uid, recentChatLimit);
        const latestThread = recent[0] ?? null;
        if (!cancelled && latestThread?.chatId) {
          const threadMessages = await loadChatMessages(uid, latestThread.chatId);
          setMessages(orderChatMessages(threadMessages));
          setActiveChatId(latestThread.chatId);
          setRecentThreads(recent);
          await saveLatestChatCache(uid, latestThread.chatId, latestThread.threadId, threadMessages);
        } else if (!cancelled) {
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
    }
    void saveLatestChatCache(uid, activeChatId, null, orderedMessages);
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
