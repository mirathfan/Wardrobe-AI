import { initializeApp, getApps, getApp } from "firebase/app";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeAuth, type Persistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function getAsyncStoragePersistence(storage: typeof AsyncStorage): Persistence {
  return class ReactNativeAsyncStoragePersistence {
    static type = "LOCAL" as const;
    readonly type = "LOCAL" as const;

    async _isAvailable() {
      try {
        const testKey = "__firebase_auth_storage_test__";
        await storage.setItem(testKey, "1");
        await storage.removeItem(testKey);
        return true;
      } catch {
        return false;
      }
    }

    _set(key: string, value: unknown) {
      return storage.setItem(key, JSON.stringify(value));
    }

    async _get<T>(key: string): Promise<T | null> {
      const value = await storage.getItem(key);
      return value ? (JSON.parse(value) as T) : null;
    }

    _remove(key: string) {
      return storage.removeItem(key);
    }

    _addListener() {
      return;
    }

    _removeListener() {
      return;
    }
  } as unknown as Persistence;
}

export const auth = initializeAuth(app, {
  persistence: getAsyncStoragePersistence(AsyncStorage),
});
export const db = getFirestore(app);
export const storage = getStorage(app);
