import {
  formatCalendarDateLabel,
  isFutureDateKey,
  isTodayDateKey,
  parseOutfitDateKey,
  toOutfitDateKey,
} from "@/src/lib/outfitDate";

describe("outfit date helpers", () => {
  const now = new Date("2026-06-01T17:00:00.000Z");

  it("formats date keys in the user's timezone", () => {
    expect(toOutfitDateKey(now, "America/Chicago")).toBe("2026-06-01");
    expect(isTodayDateKey("2026-06-01", now, "America/Chicago")).toBe(true);
    expect(isFutureDateKey("2026-06-02", now, "America/Chicago")).toBe(true);
    expect(isFutureDateKey("2026-05-31", now, "America/Chicago")).toBe(false);
  });

  it("parses and labels date keys safely", () => {
    expect(parseOutfitDateKey("2026-06-05")?.toISOString()).toContain("2026-06-05");
    expect(parseOutfitDateKey("bad-date")).toBeNull();
    expect(formatCalendarDateLabel("2026-06-05")).toContain("Jun");
  });
});
