import type { AuraOutfitWeatherContext } from "@/shared/auraOutfitCalendar";
import { getDailyWeather } from "@/src/utils/weatherDaily";

let LocationModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LocationModule = require("expo-location");
} catch {
  LocationModule = null;
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

function dateFromDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

export async function getAuraPlanningWeatherContext(
  dateKey: string,
): Promise<AuraOutfitWeatherContext | undefined> {
  if (!LocationModule || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return undefined;

  try {
    const permission = typeof LocationModule.getForegroundPermissionsAsync === "function"
      ? await LocationModule.getForegroundPermissionsAsync()
      : null;
    if (permission && !permission.granted) return undefined;

    let position;
    try {
      position = await withTimeout(
        LocationModule.getCurrentPositionAsync({ accuracy: LocationModule.Accuracy?.Balanced }),
        4500,
      );
    } catch {
      position = await LocationModule.getLastKnownPositionAsync({});
    }

    const latitude = position?.coords?.latitude;
    const longitude = position?.coords?.longitude;
    if (typeof latitude !== "number" || typeof longitude !== "number") return undefined;

    const weather = await withTimeout(getDailyWeather(latitude, longitude, dateFromDateKey(dateKey)), 6500);
    return {
      dateKey,
      locationSource: "device_location",
      temperatureHigh: weather.highC,
      temperatureLow: weather.lowC,
      condition: weather.conditionLabel,
      rawSummary: [
        weather.conditionLabel,
        typeof weather.highC === "number" ? `high ${Math.round(weather.highC)}C` : null,
        typeof weather.lowC === "number" ? `low ${Math.round(weather.lowC)}C` : null,
      ].filter(Boolean).join(", "),
    };
  } catch {
    return undefined;
  }
}
