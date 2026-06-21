/* eslint-disable @typescript-eslint/no-require-imports */
import React from "react";
import { render } from "@testing-library/react-native";

import type { OutfitCalendarEvent } from "@/src/lib/outfitCalendar";
import type { ClothingItem } from "@/src/types/ClothingItem";

import CalendarOutfitEventCard, {
  CALENDAR_OUTFIT_COMPACT_PREVIEW_WIDTH,
  CALENDAR_OUTFIT_PREVIEW_WIDTH,
} from "./CalendarOutfitEventCard";

const mockFlatLayCanvas = jest.fn<void, [unknown]>();

jest.mock("@/src/components/ui/auraStylePrimitives", () => ({
  auraCardStyle: () => ({}),
  auraTypography: {
    caption: {},
  },
}));

jest.mock("@/src/lib/outfitCalendar", () => ({
  outfitCalendarItemCount: (event: { itemIds?: string[] }) => event.itemIds?.length ?? 0,
  outfitCalendarSourceLabel: (source?: string) =>
    source === "aura_agent" ? "AURA" : "Calendar",
  outfitCalendarStatusLabel: (status: string) =>
    status === "worn" ? "Worn" : "Planned",
}));

jest.mock("@/src/components/outfit/FlatLayCanvas", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: (props: { previewWidth?: number }) => {
      mockFlatLayCanvas(props);
      return React.createElement(Text, { testID: "calendar-flatlay-width" }, String(props.previewWidth));
    },
  };
});

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Ionicons: ({ name }: { name: string }) =>
      React.createElement(Text, { accessibilityLabel: name }, name),
  };
});

jest.mock("@/src/hooks/useAppTheme", () => ({
  useAppTheme: () => ({
    colors: {
      border: "rgba(255,255,255,0.14)",
      chipBackground: "rgba(255,255,255,0.08)",
      purpleBorder: "rgba(210,180,255,0.5)",
      surfaceInteractive: "rgba(255,255,255,0.09)",
      surfaceMuted: "rgba(255,255,255,0.06)",
      surfaceSoft: "rgba(255,255,255,0.1)",
      text: "#fff",
      textMuted: "rgba(255,255,255,0.5)",
      textSecondary: "rgba(255,255,255,0.72)",
    },
  }),
}));

function item(id: string): ClothingItem {
  return {
    id,
    name: id,
    category: "top",
    status: "AVAILABLE",
    wearCountSinceWash: 0,
    createdAt: 0,
  } as ClothingItem;
}

const event: OutfitCalendarEvent = {
  id: "2026-06-07:planned:one",
  status: "planned",
  dateKey: "2026-06-07",
  source: "aura_agent",
  title: "Planned outfit",
  itemsByCategory: {
    outerwear: "outerwear-1",
    top: "top-1",
    bottom: "bottom-1",
    shoes: "shoe-1",
  },
  itemIds: ["outerwear-1", "top-1", "bottom-1", "shoe-1"],
  reasons: [],
  weatherWarnings: [],
  raw: {
    itemsByCategory: {
      outerwear: "outerwear-1",
      top: "top-1",
      bottom: "bottom-1",
      shoes: "shoe-1",
    },
    score: 1,
    reasons: [],
    source: "aura_agent",
    title: "Planned outfit",
    createdAt: 0,
  },
};

const itemsById = new Map<string, ClothingItem>([
  ["outerwear-1", item("outerwear-1")],
  ["top-1", item("top-1")],
  ["bottom-1", item("bottom-1")],
  ["shoe-1", item("shoe-1")],
]);

describe("CalendarOutfitEventCard", () => {
  beforeEach(() => {
    mockFlatLayCanvas.mockClear();
  });

  it("uses a bounded compact preview for calendar outfit rows", () => {
    const { getByTestId } = render(
      <CalendarOutfitEventCard
        compact
        event={event}
        itemsById={itemsById}
        onPress={jest.fn()}
      />,
    );

    expect(getByTestId("calendar-flatlay-width").props.children).toBe(
      String(CALENDAR_OUTFIT_COMPACT_PREVIEW_WIDTH),
    );
    expect(mockFlatLayCanvas).toHaveBeenCalledWith(
      expect.objectContaining({
        previewWidth: CALENDAR_OUTFIT_COMPACT_PREVIEW_WIDTH,
      }),
    );
  });

  it("uses a slightly larger preview for non-compact calendar outfit cards", () => {
    const { getByTestId } = render(
      <CalendarOutfitEventCard
        event={event}
        itemsById={itemsById}
        onPress={jest.fn()}
      />,
    );

    expect(getByTestId("calendar-flatlay-width").props.children).toBe(
      String(CALENDAR_OUTFIT_PREVIEW_WIDTH),
    );
  });
});
