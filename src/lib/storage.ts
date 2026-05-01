import { createMMKV } from "react-native-mmkv";

export const storage = createMMKV({
  id: "aura-storage",
});

export const Storage = {
  getItem: (key: string) => {
    const value = storage.getString(key);
    return Promise.resolve(value ?? null);
  },
  setItem: (key: string, value: string) => {
    storage.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    storage.remove(key);
    return Promise.resolve();
  },
  clearUserScopedData: (uid: string) => {
    const prefix = `aura:${uid}:`;
    const legacyChatPrefix = `outfit-chat:${uid}:`;
    storage.getAllKeys().forEach((key) => {
      if (key.startsWith(prefix) || key.startsWith(legacyChatPrefix)) storage.remove(key);
    });
    return Promise.resolve();
  },
  getAllKeys: () => {
    return Promise.resolve(storage.getAllKeys());
  },
  multiGet: (keys: string[]) => {
    return Promise.resolve(keys.map((key) => [key, storage.getString(key) ?? null]));
  },
};
