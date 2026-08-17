import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

import { firebaseConfigStatus, logFirebaseConfigProblem } from "./firebaseConfig";

type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
};

function isDevBuild() {
  return typeof __DEV__ !== "undefined" && __DEV__;
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
    return {
      app,
      auth: getAuth(app),
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
