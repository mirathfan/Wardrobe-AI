import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth, initializeAuth, type Auth, type Persistence } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

import { firebaseConfigStatus, logFirebaseConfigProblem } from "./firebaseConfig";

// Certificate pinning is handled by Firebase SDK.
// Do not override or disable SSL verification anywhere in this codebase.
type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
};

function isDevBuild() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

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

function firebaseUnavailableError(serviceName: string) {
  const error = new Error(`AURA Firebase ${serviceName} is unavailable.`);
  error.name = "FirebaseConfigurationError";
  return error;
}

function unavailableFirebaseService<T extends object>(serviceName: string): T {
  return new Proxy({} as T, {
    get() {
      throw firebaseUnavailableError(serviceName);
    },
    set() {
      throw firebaseUnavailableError(serviceName);
    },
  });
}

function logFirebaseInitializationError(error: unknown) {
  if (isDevBuild()) {
    console.error("[Firebase] Failed to initialize Firebase services.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  console.error("[Firebase] Failed to initialize Firebase services.");
}

function initializeFirebaseServices(): FirebaseServices | null {
  if (!firebaseConfigStatus.ok) {
    logFirebaseConfigProblem(firebaseConfigStatus);
    return null;
  }

  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfigStatus.config);
    let auth: Auth;
    try {
      auth = initializeAuth(app, {
        persistence: getAsyncStoragePersistence(AsyncStorage),
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== "auth/already-initialized") {
        throw error;
      }
      auth = getAuth(app);
    }

    return {
      app,
      auth,
      db: getFirestore(app),
      storage: getStorage(app),
    };
  } catch (error) {
    firebaseInitializationError = error instanceof Error ? error : new Error("Firebase initialization failed.");
    logFirebaseInitializationError(error);
    return null;
  }
}

export let firebaseInitializationError: Error | null = null;
const firebaseServices = initializeFirebaseServices();

export function hasFirebaseServices() {
  return firebaseServices !== null;
}

export function requireFirebaseServices() {
  if (!firebaseServices) throw firebaseUnavailableError("services");
  return firebaseServices;
}

export { firebaseConfigStatus };

export const app = firebaseServices?.app ?? unavailableFirebaseService<FirebaseApp>("app");
export const auth = firebaseServices?.auth ?? unavailableFirebaseService<Auth>("auth");
export const db = firebaseServices?.db ?? unavailableFirebaseService<Firestore>("db");
export const storage =
  firebaseServices?.storage ?? unavailableFirebaseService<FirebaseStorage>("storage");
