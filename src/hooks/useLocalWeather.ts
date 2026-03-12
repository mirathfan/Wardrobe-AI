import { useCallback, useMemo, useState } from "react";
import { Linking } from "react-native";

import { getStoredJson, setStoredJson } from "../utils/storage";
import { weatherCodeToLabel } from "../utils/weather";

type WeatherState = "idle" | "loading" | "ready" | "error";
type PermissionState = "unknown" | "granted" | "denied" | "blocked";

type WeatherCache = {
  tempC?: number;
  apparentTempC?: number;
  label?: string;
  city?: string;
  updatedAt: number;
};

const WEATHER_CACHE_KEY = "wardrobe_ai_weather_cache_v1";
const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;

let LocationModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LocationModule = require("expo-location");
} catch {
  LocationModule = null;
}

function formatUpdatedAt(ms?: number) {
  if (!ms) return undefined;
  const deltaMinutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes === 1) return "1 min ago";
  return `${deltaMinutes} mins ago`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error("timeout"));
      }, ms);
    }),
  ]);
}

export function useLocalWeather() {
  const [state, setState] = useState<WeatherState>("idle");
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [tempC, setTempC] = useState<number | undefined>();
  const [label, setLabel] = useState<string | undefined>();
  const [city, setCity] = useState<string | undefined>();
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();

  const fetchWeather = useCallback(async () => {
    if (!LocationModule) {
      setState("error");
      return;
    }

    setState("loading");

    try {
      const cached = await getStoredJson<WeatherCache>(WEATHER_CACHE_KEY);
      if (cached && Date.now() - cached.updatedAt <= WEATHER_CACHE_TTL_MS) {
        setTempC(cached.tempC);
        setLabel(cached.label);
        setCity(cached.city);
        setUpdatedAt(cached.updatedAt);
        setState("ready");
        return;
      }

      let position;
      try {
        position = await withTimeout(
          LocationModule.getCurrentPositionAsync({
            accuracy: LocationModule.Accuracy?.Balanced,
          }),
          8000
        );
      } catch {
        position = await LocationModule.getLastKnownPositionAsync({});
      }

      const latitude = position?.coords?.latitude;
      const longitude = position?.coords?.longitude;

      if (typeof latitude !== "number" || typeof longitude !== "number") {
        setState("error");
        return;
      }

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`;
      const response = await withTimeout(fetch(url), 8000);
      if (!response.ok) throw new Error("weather fetch failed");
      const json = await response.json();

      const current = json?.current;
      const nextTemp = typeof current?.temperature_2m === "number" ? current.temperature_2m : undefined;
      const nextApparent =
        typeof current?.apparent_temperature === "number" ? current.apparent_temperature : undefined;
      const nextLabel = weatherCodeToLabel(
        typeof current?.weather_code === "number" ? current.weather_code : undefined
      );

      let nextCity: string | undefined;
      try {
        const places = await LocationModule.reverseGeocodeAsync({ latitude, longitude });
        const first = places?.[0];
        nextCity = first?.city || first?.district || first?.subregion || undefined;
      } catch {
        nextCity = undefined;
      }

      const timestamp = Date.now();
      setTempC(nextTemp);
      setLabel(nextLabel);
      setCity(nextCity);
      setUpdatedAt(timestamp);
      setState("ready");

      await setStoredJson<WeatherCache>(WEATHER_CACHE_KEY, {
        tempC: nextTemp,
        apparentTempC: nextApparent,
        label: nextLabel,
        city: nextCity,
        updatedAt: timestamp,
      });
    } catch {
      setState("error");
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!LocationModule) {
      setPermission("blocked");
      setState("error");
      return;
    }

    try {
      const result = await LocationModule.requestForegroundPermissionsAsync();
      if (result?.granted) {
        setPermission("granted");
        await fetchWeather();
        return;
      }

      if (result?.canAskAgain === false) {
        setPermission("blocked");
      } else {
        setPermission("denied");
      }
      setState("idle");
    } catch {
      setPermission("blocked");
      setState("error");
    }
  }, [fetchWeather]);

  const refresh = useCallback(async () => {
    if (permission !== "granted") {
      return;
    }
    await fetchWeather();
  }, [fetchWeather, permission]);

  const openSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      // no-op
    }
  }, []);

  const lastUpdatedLabel = useMemo(() => formatUpdatedAt(updatedAt), [updatedAt]);

  return {
    permission,
    state,
    tempC,
    label,
    city,
    lastUpdatedLabel,
    actions: {
      requestPermission,
      refresh,
      openSettings,
    },
  };
}
