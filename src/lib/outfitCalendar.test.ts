/* eslint-disable import/first */
const mockClearPlan = jest.fn();
const mockClearWorn = jest.fn();
const mockGetOutfitByDate = jest.fn();

jest.mock("@/src/utils/dailyOutfits", () => ({
  clearPlan: mockClearPlan,
  clearWorn: mockClearWorn,
  getOutfitByDate: mockGetOutfitByDate,
}));

import {
  buildOutfitCalendarEvents,
  cancelOutfitEvent,
  outfitCalendarItemCount,
  outfitCalendarSourceLabel,
  outfitCalendarStatusLabel,
} from "@/src/lib/outfitCalendar";
import type { DailyOutfitRecord } from "@/src/utils/dailyOutfits";

describe("outfit calendar event adapter", () => {
  const record: DailyOutfitRecord = {
    dateKey: "2026-06-05",
    plannedOutfit: {
      itemsByCategory: {
        top: "shirt-1",
        bottom: "pants-1",
        shoes: "shoe-1",
        accessories: ["watch-1"],
      },
      score: 92,
      reasons: ["Smart enough for office."],
      createdAt: 1,
      source: "aura_agent",
      title: "Polished Blue",
      outfitFingerprint: "planned-fingerprint",
      weatherWarnings: [
        {
          severity: "info",
          message: "Bring a layer.",
        },
      ],
    },
    wornOutfit: {
      itemsByCategory: {
        top: "tee-1",
        bottom: "jeans-1",
        shoes: "sneaker-1",
      },
      wornAt: 1_717_200_000_000,
      source: "calendar",
      title: "Casual repeat",
      outfitFingerprint: "worn-fingerprint",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("builds planned and worn events from the existing daily outfit model", () => {
    const events = buildOutfitCalendarEvents(record);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      status: "planned",
      dateKey: "2026-06-05",
      source: "aura_agent",
      title: "Polished Blue",
      itemIds: ["shirt-1", "pants-1", "shoe-1", "watch-1"],
    });
    expect(events[1]).toMatchObject({
      status: "worn",
      title: "Casual repeat",
      itemIds: ["tee-1", "jeans-1", "sneaker-1"],
    });
    expect(outfitCalendarItemCount(events[0]!)).toBe(4);
    expect(outfitCalendarStatusLabel("planned")).toBe("Planned");
    expect(outfitCalendarStatusLabel("worn")).toBe("Worn");
    expect(outfitCalendarSourceLabel("aura_agent")).toBe("AURA");
  });

  it("routes cancel requests to the existing clear helpers", async () => {
    mockClearPlan.mockResolvedValueOnce(null);
    mockClearWorn.mockResolvedValueOnce(null);

    await cancelOutfitEvent("uid-1", "2026-06-05", "planned");
    await cancelOutfitEvent("uid-1", "2026-06-05", "worn");

    expect(mockClearPlan).toHaveBeenCalledWith("uid-1", "2026-06-05");
    expect(mockClearWorn).toHaveBeenCalledWith("uid-1", "2026-06-05");
  });
});
