import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";

import { DailyWeather, getDailyWeather } from "../utils/weatherDaily";

type WeatherState = "idle" | "loading" | "ready" | "error";
type PermissionState = "unknown" | "granted" | "denied" | "blocked";

let LocationModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LocationModule = require("expo-location");
} catch {
  LocationModule = null;
}

export function useDayWeather(selectedDate: Date) {
  const [state, setState] = useState<WeatherState>("idle");
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [weather, setWeather] = useState<DailyWeather | null>(null);

  const fetchWeather = useCallback(async () => {
    if (!LocationModule) {
      setState("error");
      return;
    }

    setState("loading");

    try {
      let position;
      try {
        position = await LocationModule.getCurrentPositionAsync({ accuracy: LocationModule.Accuracy?.Balanced });
      } catch {
        position = await LocationModule.getLastKnownPositionAsync({});
      }

      const lat = position?.coords?.latitude;
      const lon = position?.coords?.longitude;
      if (typeof lat !== "number" || typeof lon !== "number") {
        setState("error");
        return;
      }

      const result = await getDailyWeather(lat, lon, selectedDate);
      setWeather(result);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [selectedDate]);

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
    if (permission !== "granted") return;
    await fetchWeather();
  }, [fetchWeather, permission]);

  const openSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (permission === "granted") {
      fetchWeather().catch(() => setState("error"));
    }
  }, [fetchWeather, permission]);

  return {
    permission,
    state,
    weather,
    actions: {
      requestPermission,
      refresh,
      openSettings,
    },
  };
}
