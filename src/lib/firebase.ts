import { initializeApp, getApps, getApp } from "firebase/app";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD1dGOddJZqr7qYYX7p0l0c5MWo-xTp5Ss",
  authDomain: "closet-app-57146.firebaseapp.com",
  projectId: "closet-app-57146",
  storageBucket: "closet-app-57146.firebasestorage.app",
  messagingSenderId: "1043970871162",
  appId: "1:1043970871162:web:87c7eb1a6ffcf5b9ad50c3",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);
export const storage = getStorage(app);
