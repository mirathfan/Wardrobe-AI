import { toDayKey } from "./date";
import { getStoredJson, setStoredJson } from "./storage";
import { weatherCodeToLabel } from "./weather";

export type DailyWeather = {
  date: string;
  highC?: number;
  lowC?: number;
  conditionLabel?: string;
  nowC?: number;
};

type DailyWeatherCache = {
  value: DailyWeather;
  savedAt: number;
};

const TTL_MS = 24 * 60 * 60 * 1000;
const WEATHER_CACHE_PREFIX = "wardrobe_ai_daily_weather_v1";

function isPastDate(dayKey: string) {
  const today = toDayKey(new Date());
  return dayKey < today;
}

function isToday(dayKey: string) {
  return dayKey === toDayKey(new Date());
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("weather fetch failed");
  return response.json();
}

export async function getDailyWeather(latitude: number, longitude: number, date: Date): Promise<DailyWeather> {
  const dayKey = toDayKey(date);
  const cacheKey = `${WEATHER_CACHE_PREFIX}:${dayKey}:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
  const cached = await getStoredJson<DailyWeatherCache>(cacheKey);
  if (cached && Date.now() - cached.savedAt <= TTL_MS) {
    return cached.value;
  }

  const base = isPastDate(dayKey)
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";

  const includeCurrent = isToday(dayKey) ? ",temperature_2m" : "";
  const url = `${base}?latitude=${latitude}&longitude=${longitude}&start_date=${dayKey}&end_date=${dayKey}&daily=temperature_2m_max,temperature_2m_min,weather_code&current=weather_code${includeCurrent}&timezone=auto`;
  const json = await fetchJson(url);

  const daily = json?.daily;
  const current = json?.current;

  const highC = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max[0] : undefined;
  const lowC = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min[0] : undefined;
  const code = Array.isArray(daily?.weather_code)
    ? daily.weather_code[0]
    : typeof current?.weather_code === "number"
      ? current.weather_code
      : undefined;

  const nowC = typeof current?.temperature_2m === "number" ? current.temperature_2m : undefined;

  const value: DailyWeather = {
    date: dayKey,
    highC: typeof highC === "number" ? highC : undefined,
    lowC: typeof lowC === "number" ? lowC : undefined,
    conditionLabel: weatherCodeToLabel(typeof code === "number" ? code : undefined),
    nowC,
  };

  await setStoredJson<DailyWeatherCache>(cacheKey, {
    value,
    savedAt: Date.now(),
  });

  return value;
}
