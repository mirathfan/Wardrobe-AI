import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "outfit-chat:";
const MAX_MESSAGES_PER_SESSION = 30;
const MAX_SESSIONS = 6;

function logSession(event: string, data: Record<string, unknown>) {
  console.log(`[AIChatSession] ${event}`, data);
}

export type LocalChatSession<T> = {
  sessionId: string;
  threadId: string | null;
  createdAt: number;
  updatedAt: number;
  messages: T[];
};

type CachePayload<T> = {
  chatId?: string | null;
  threadId: string | null;
  messages: T[];
  updatedAt?: number;
};

type SessionStore<T> = {
  latestSessionId: string | null;
  sessions: LocalChatSession<T>[];
};

function createSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getScopedKey(uid: string, suffix: string) {
  return `${CACHE_PREFIX}${uid}:${suffix}`;
}

function trimMessages<T>(messages: T[]) {
  return messages.slice(-MAX_MESSAGES_PER_SESSION);
}

function sortSessions<T>(sessions: LocalChatSession<T>[]) {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
}

async function loadRawStore<T>(uid: string): Promise<SessionStore<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(getScopedKey(uid, "sessions-v2"));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionStore<T>;
    if (!parsed || !Array.isArray(parsed.sessions)) return null;
    return {
      latestSessionId: typeof parsed.latestSessionId === "string" ? parsed.latestSessionId : null,
      sessions: parsed.sessions
        .filter((session) => session && typeof session === "object")
        .map((session) => ({
          sessionId: String(session.sessionId ?? createSessionId()),
          threadId: typeof session.threadId === "string" ? session.threadId : null,
          createdAt: typeof session.createdAt === "number" ? session.createdAt : Date.now(),
          updatedAt: typeof session.updatedAt === "number" ? session.updatedAt : Date.now(),
          messages: Array.isArray(session.messages) ? trimMessages(session.messages) : [],
        })),
    };
  } catch {
    return null;
  }
}

async function loadStore<T>(uid: string): Promise<SessionStore<T>> {
  const existing = await loadRawStore<T>(uid);
  if (existing) {
    return {
      latestSessionId: existing.latestSessionId,
      sessions: sortSessions(existing.sessions),
    };
  }

  return { latestSessionId: null, sessions: [] };
}

async function persistStore<T>(uid: string, store: SessionStore<T>): Promise<void> {
  try {
    await AsyncStorage.setItem(
      getScopedKey(uid, "sessions-v2"),
      JSON.stringify({
        latestSessionId: store.latestSessionId,
        sessions: sortSessions(store.sessions).map((session) => ({
          ...session,
          messages: trimMessages(session.messages),
        })),
      })
    );
  } catch {
    // cache failures should never block chat
  }
}

export function createNewSession<T>(): LocalChatSession<T> {
  const now = Date.now();
  return {
    sessionId: createSessionId(),
    threadId: null,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export async function loadLatestSession<T>(uid: string): Promise<LocalChatSession<T> | null> {
  const store = await loadStore<T>(uid);
  const latest =
    store.sessions.find((session) => session.sessionId === store.latestSessionId) ??
    store.sessions[0] ??
    null;
  logSession("loadLatestSession", {
    latestSessionId: latest?.sessionId ?? null,
    sessionCount: store.sessions.length,
  });
  return latest;
}

export async function saveSession<T>(uid: string, session: LocalChatSession<T>): Promise<void> {
  const store = await loadStore<T>(uid);
  const nextSession: LocalChatSession<T> = {
    ...session,
    updatedAt: typeof session.updatedAt === "number" ? session.updatedAt : Date.now(),
    messages: trimMessages(Array.isArray(session.messages) ? session.messages : []),
  };
  const sessions = sortSessions([
    nextSession,
    ...store.sessions.filter((entry) => entry.sessionId !== nextSession.sessionId),
  ]);
  await persistStore(uid, {
    latestSessionId: nextSession.sessionId,
    sessions,
  });
  logSession("saveSession", {
    sessionId: nextSession.sessionId,
    threadId: nextSession.threadId,
    messageCount: nextSession.messages.length,
    sessionCount: sessions.length,
  });
}

export async function clearSession(uid: string, sessionId?: string): Promise<void> {
  const store = await loadStore<unknown>(uid);
  const nextSessions = sessionId
    ? store.sessions.filter((session) => session.sessionId !== sessionId)
    : store.sessions.filter((session) => session.sessionId !== store.latestSessionId);
  await persistStore(uid, {
    latestSessionId: nextSessions[0]?.sessionId ?? null,
    sessions: nextSessions,
  });
  logSession("clearSession", {
    removedSessionId: sessionId ?? store.latestSessionId ?? null,
    remainingSessionCount: nextSessions.length,
    nextLatestSessionId: nextSessions[0]?.sessionId ?? null,
  });
}

export async function loadLatestChatCache<T>(uid: string): Promise<CachePayload<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(getScopedKey(uid, "latest-chat-v3"));
    if (raw) {
      const parsed = JSON.parse(raw) as CachePayload<T>;
      if (parsed && Array.isArray(parsed.messages)) {
        return {
          chatId: typeof parsed.chatId === "string" ? parsed.chatId : null,
          threadId: typeof parsed.threadId === "string" ? parsed.threadId : null,
          messages: parsed.messages,
          updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
        };
      }
    }
  } catch {
    // fall through to session cache
  }
  const latest = await loadLatestSession<T>(uid);
  if (!latest) return null;
  return {
    chatId: latest.sessionId,
    threadId: latest.threadId,
    messages: latest.messages,
    updatedAt: latest.updatedAt,
  };
}

export async function saveLatestChatCache<T>(
  uid: string,
  chatId: string | null,
  threadId: string | null,
  messages: T[]
): Promise<void> {
  try {
    if (!chatId) {
      await AsyncStorage.removeItem(getScopedKey(uid, "latest-chat-v3"));
      return;
    }
    await AsyncStorage.setItem(
      getScopedKey(uid, "latest-chat-v3"),
      JSON.stringify({
        chatId,
        threadId,
        messages: trimMessages(Array.isArray(messages) ? messages : []),
        updatedAt: Date.now(),
      } satisfies CachePayload<T>)
    );
  } catch {
    // cache failures should never block chat
  }
}

export async function clearLatestChatCache(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(getScopedKey(uid, "latest-chat-v3"));
  } catch {
    // ignore
  }
  const latest = await loadLatestSession<unknown>(uid);
  if (!latest) return;
  await clearSession(uid, latest.sessionId);
}
