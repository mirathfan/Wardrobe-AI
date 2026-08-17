jest.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();

  const asyncStorage = {
    getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      storage.delete(key);
    }),
    mergeItem: jest.fn(async (key: string, value: string) => {
      const existing = storage.get(key);
      storage.set(key, existing ? `${existing}${value}` : value);
    }),
    clear: jest.fn(async () => {
      storage.clear();
    }),
    getAllKeys: jest.fn(async () => Array.from(storage.keys())),
    flushGetRequests: jest.fn(),
    multiGet: jest.fn(async (keys: string[]) =>
      keys.map((key) => [key, storage.get(key) ?? null]),
    ),
    multiSet: jest.fn(async (entries: [string, string][]) => {
      for (const [key, value] of entries) storage.set(key, value);
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const key of keys) storage.delete(key);
    }),
    multiMerge: jest.fn(async (entries: [string, string][]) => {
      for (const [key, value] of entries) {
        const existing = storage.get(key);
        storage.set(key, existing ? `${existing}${value}` : value);
      }
    }),
  };

  return {
    __esModule: true,
    default: asyncStorage,
    ...asyncStorage,
  };
});

jest.mock("react-native/Libraries/Animated/NativeAnimatedHelper", () => ({}), {
  virtual: true,
});
