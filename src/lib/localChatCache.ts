import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "outfit-chat:";
const LATEST_KEY = `${CACHE_PREFIX}latest-thread`;

type CachePayload<T> = {
  threadId: string | null;
  messages: T[];
};

export async function loadLatestChatCache<T>(): Promise<CachePayload<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(LATEST_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachePayload<T>;
  } catch {
    return null;
  }
}

export async function saveLatestChatCache<T>(
  threadId: string | null,
  messages: T[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      LATEST_KEY,
      JSON.stringify({
        threadId,
        messages: messages.slice(-30),
      })
    );
  } catch {
    // cache failures should never block chat
  }
}

export async function clearLatestChatCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LATEST_KEY);
  } catch {
    // ignore cache clear failures
  }
}
