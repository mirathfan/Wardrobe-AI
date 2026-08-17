import { User, onAuthStateChanged } from "firebase/auth";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { auth, hasFirebaseServices } from "../lib/firebase";

const AUTH_CHECK_TIMEOUT_MS = 10_000;

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  authCheckTimedOut: boolean;
  retryAuthCheck: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authCheckTimedOut, setAuthCheckTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let settled = false;
    setLoading(true);
    setAuthCheckTimedOut(false);

    if (!hasFirebaseServices()) {
      setUser(null);
      setLoading(false);
      return () => {
        settled = true;
      };
    }

    const timeout = setTimeout(() => {
      if (!settled) {
        setAuthCheckTimedOut(true);
      }
    }, AUTH_CHECK_TIMEOUT_MS);

    const unsub = onAuthStateChanged(
      auth,
      (nextUser) => {
        settled = true;
        clearTimeout(timeout);
        setUser(nextUser);
        setLoading(false);
        setAuthCheckTimedOut(false);
      },
      (error) => {
        if (__DEV__) {
          console.warn("[Auth] Session check failed", error);
        }
        settled = true;
        clearTimeout(timeout);
        setAuthCheckTimedOut(true);
      },
    );

    return () => {
      settled = true;
      clearTimeout(timeout);
      unsub();
    };
  }, [retryKey]);

  const retryAuthCheck = React.useCallback(() => {
    setRetryKey((value) => value + 1);
  }, []);

  const value = useMemo(
    () => ({ user, loading, authCheckTimedOut, retryAuthCheck }),
    [authCheckTimedOut, loading, retryAuthCheck, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
