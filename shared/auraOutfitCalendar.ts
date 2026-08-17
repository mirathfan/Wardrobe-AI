export type OutfitDateInstructionIntent = "wore" | "plan" | "unknown";

export type ParsedOutfitDateInstruction = {
  intent: OutfitDateInstructionIntent;
  dateKey?: string;
  date?: Date;
  confidence: number;
  reason: string;
};

export type AuraOutfitWeatherContext = {
  dateKey: string;
  locationSource?: string;
  temperatureHigh?: number;
  temperatureLow?: number;
  condition?: string;
  precipitationChance?: number;
  windSpeed?: number;
  rawSummary?: string;
};

export type AuraOutfitWeatherWarning = {
  severity: "info" | "warning" | "critical";
  message: string;
  itemIds?: string[];
};

type OutfitItemForWeather = {
  itemId?: string | null;
  role?: string | null;
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  colors?: string[] | null;
};

export type OutfitForWeatherWarnings = {
  items?: OutfitItemForWeather[] | null;
};

const DEFAULT_TIMEZONE = "America/Chicago";
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const MONTH_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lowerText(value: unknown) {
  return cleanText(value).toLowerCase();
}

function timezoneParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: WEEKDAY_INDEX[get("weekday").toLowerCase()] ?? 0,
  };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateKeyFromParts(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function dateKeyForTimezone(date: Date, timezone: string) {
  const parts = timezoneParts(date, timezone);
  return dateKeyFromParts(parts.year, parts.month, parts.day);
}

function addDaysToDateKey(dateKey: string, offset: number) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day + offset, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function compareDateKeys(left?: string, right?: string) {
  if (!left || !right) return 0;
  return left.localeCompare(right);
}

function weekdayDateKey(todayKey: string, todayWeekday: number, targetWeekday: number, qualifier: string, intent: OutfitDateInstructionIntent) {
  let diff = targetWeekday - todayWeekday;
  if (qualifier === "last") {
    if (diff >= 0) diff -= 7;
  } else if (qualifier === "next") {
    if (diff <= 0) diff += 7;
  } else if (qualifier === "this") {
    if (diff < 0) diff += 7;
  } else if (intent === "wore") {
    if (diff > 0) diff -= 7;
  } else if (diff < 0) {
    diff += 7;
  }
  return addDaysToDateKey(todayKey, diff);
}

function dateKeyFromMonthDay(monthIndex: number, day: number, year: number, todayKey: string, intent: OutfitDateInstructionIntent) {
  let candidate = dateKeyFromParts(year, monthIndex + 1, day);
  if (intent === "plan" && compareDateKeys(candidate, todayKey) < 0) {
    candidate = dateKeyFromParts(year + 1, monthIndex + 1, day);
  } else if (intent === "wore" && compareDateKeys(candidate, todayKey) > 0) {
    candidate = dateKeyFromParts(year - 1, monthIndex + 1, day);
  }
  return candidate;
}

function inferDateIntent(text: string): OutfitDateInstructionIntent {
  if (/\b(wore|worn|worn this|marked? worn|log(?:ged)?(?: this)?(?: outfit)?(?: as worn)?|i wore)\b/.test(text)) {
    return "wore";
  }
  if (
    /\b(plan|planned|schedule|scheduled)\b/.test(text) ||
    /\bsave\b.{0,64}\bfor\b/.test(text) ||
    /\bwear\b.{0,64}\b(?:on|next|this|tomorrow|today|in|for|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{1,2}\/\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(text)
  ) {
    return "plan";
  }
  return "unknown";
}

export function parseOutfitDateInstruction(
  text: string,
  now: Date = new Date(),
  timezone: string = DEFAULT_TIMEZONE,
): ParsedOutfitDateInstruction {
  const normalized = lowerText(text);
  const intent = inferDateIntent(normalized);
  if (intent === "unknown") {
    return { intent: "unknown", confidence: 0.1, reason: "No outfit date action was found." };
  }

  const todayParts = timezoneParts(now, timezone || DEFAULT_TIMEZONE);
  const todayKey = dateKeyForTimezone(now, timezone || DEFAULT_TIMEZONE);
  let dateKey: string | undefined;
  let reason = "";
  let confidence = 0.9;

  const inDaysMatch = normalized.match(/\bin\s+(\d{1,2})\s+days?\b/);
  if (inDaysMatch) {
    dateKey = addDaysToDateKey(todayKey, Number(inDaysMatch[1]));
    reason = "relative-day-offset";
  }

  if (!dateKey && /\btoday\b/.test(normalized)) {
    dateKey = todayKey;
    reason = "today";
  }
  if (!dateKey && /\btomorrow\b/.test(normalized)) {
    dateKey = addDaysToDateKey(todayKey, 1);
    reason = "tomorrow";
  }
  if (!dateKey && /\byesterday\b/.test(normalized)) {
    dateKey = addDaysToDateKey(todayKey, -1);
    reason = "yesterday";
  }

  const weekdayMatch = normalized.match(/\b(?:(last|next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (!dateKey && weekdayMatch) {
    const qualifier = weekdayMatch[1] ?? "";
    const targetWeekday = WEEKDAY_INDEX[weekdayMatch[2]] ?? todayParts.weekday;
    dateKey = weekdayDateKey(todayKey, todayParts.weekday, targetWeekday, qualifier, intent);
    reason = qualifier ? `${qualifier}-weekday` : "weekday";
    confidence = qualifier || /\b(on|for|this|next|last|wear|wore|save|plan|schedule)\b/.test(normalized) ? 0.86 : 0.68;
  }

  const monthDayMatch = normalized.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\b/);
  if (!dateKey && monthDayMatch) {
    const month = MONTH_INDEX[monthDayMatch[1]];
    const day = Number(monthDayMatch[2]);
    const year = monthDayMatch[3] ? Number(monthDayMatch[3]) : todayParts.year;
    if (month != null && day >= 1 && day <= 31) {
      dateKey = dateKeyFromMonthDay(month, day, year, todayKey, intent);
      reason = "month-day";
    }
  }

  const numericDateMatch = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!dateKey && numericDateMatch) {
    const month = Number(numericDateMatch[1]);
    const day = Number(numericDateMatch[2]);
    const rawYear = numericDateMatch[3] ? Number(numericDateMatch[3]) : todayParts.year;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      dateKey = dateKeyFromMonthDay(month - 1, day, year, todayKey, intent);
      reason = "numeric-date";
    }
  }

  if (!dateKey) {
    return {
      intent,
      confidence: 0.35,
      reason: "Action was found, but no clear date was found.",
    };
  }

  return {
    intent,
    dateKey,
    date: dateKeyToDate(dateKey),
    confidence,
    reason,
  };
}

function itemText(item: OutfitItemForWeather) {
  return [
    item.role,
    item.name,
    item.category,
    item.subcategory,
    item.brand,
    ...(item.colors ?? []),
  ].map(lowerText).filter(Boolean).join(" ");
}

function matchingItemIds(outfit: OutfitForWeatherWarnings, matcher: (text: string) => boolean) {
  return (outfit.items ?? [])
    .filter((item) => matcher(itemText(item)))
    .map((item) => cleanText(item.itemId))
    .filter(Boolean);
}

function hasRole(outfit: OutfitForWeatherWarnings, role: string) {
  return (outfit.items ?? []).some((item) => lowerText(item.role) === role);
}

function weatherText(weather: AuraOutfitWeatherContext) {
  return lowerText([weather.condition, weather.rawSummary].filter(Boolean).join(" "));
}

export function buildOutfitWeatherWarnings(
  outfit: OutfitForWeatherWarnings,
  weatherContext?: AuraOutfitWeatherContext | null,
): AuraOutfitWeatherWarning[] {
  if (!weatherContext) return [];
  const text = weatherText(weatherContext);
  const high = weatherContext.temperatureHigh;
  const low = weatherContext.temperatureLow;
  const precip = weatherContext.precipitationChance;
  const wind = weatherContext.windSpeed;
  const warnings: AuraOutfitWeatherWarning[] = [];
  const hasRain = /\b(rain|shower|storm|drizzle|thunder)\b/.test(text) || (typeof precip === "number" && precip >= 45);
  const hasSnow = /\b(snow|sleet|ice|freezing)\b/.test(text);
  const isCold = typeof low === "number" ? low <= 7 : typeof high === "number" && high <= 10;
  const isHot = typeof high === "number" && high >= 29;
  const isWindy = typeof wind === "number" && wind >= 25;

  if (hasRain) {
    const riskyIds = matchingItemIds(outfit, (value) =>
      /\b(suede|sandal|espadrille|canvas|linen|white|cream|light)\b/.test(value),
    );
    warnings.push({
      severity: riskyIds.length ? "warning" : "info",
      message: `${weatherContext.dateKey} may be rainy, so consider a waterproof layer or shoes that can handle wet pavement.`,
      ...(riskyIds.length ? { itemIds: riskyIds } : {}),
    });
  }

  if (hasSnow) {
    const riskyIds = matchingItemIds(outfit, (value) =>
      /\b(sneaker|sandal|loafer|canvas|linen|light trouser)\b/.test(value),
    );
    warnings.push({
      severity: "warning",
      message: `${weatherContext.dateKey} may have snow or ice, so choose traction and warmer layers.`,
      ...(riskyIds.length ? { itemIds: riskyIds } : {}),
    });
  }

  if (isCold && !hasRole(outfit, "outerwear")) {
    warnings.push({
      severity: "warning",
      message: `${weatherContext.dateKey} looks cold; this outfit has no outerwear.`,
    });
  }

  if (isHot) {
    const heavyIds = matchingItemIds(outfit, (value) =>
      /\b(puffer|wool|fleece|heavy|coat|parka|thick)\b/.test(value),
    );
    if (heavyIds.length) {
      warnings.push({
        severity: "info",
        message: `${weatherContext.dateKey} may be hot, so the heavier layer could feel too warm.`,
        itemIds: heavyIds,
      });
    }
  }

  if (isWindy) {
    const lightIds = matchingItemIds(outfit, (value) => /\b(loose|linen|silk|lightweight)\b/.test(value));
    warnings.push({
      severity: "info",
      message: `${weatherContext.dateKey} may be windy; secure light layers or add a more structured outer layer.`,
      ...(lightIds.length ? { itemIds: lightIds } : {}),
    });
  }

  return warnings.slice(0, 3);
}
