import { Storage } from "@/src/lib/storage";

export async function getStoredJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await Storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setStoredJson<T>(key: string, value: T) {
  try {
    await Storage.setItem(key, JSON.stringify(value));
  } catch {
    // no-op
  }
}
