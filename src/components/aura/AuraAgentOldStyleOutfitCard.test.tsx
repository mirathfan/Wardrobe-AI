/* eslint-disable @typescript-eslint/no-require-imports */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { Colors } from "@/constants/theme";
import type {
  AuraAgentOutfit,
  AuraAgentResponse,
  AuraAgentSuggestedAction,
} from "@/src/types/auraAgent";

import AuraAgentMessage from "./AuraAgentMessage";
import {
  getAgentCarouselPageLabel,
  getCurrentAgentCarouselOutfit,
  shouldRenderAgentOutfitCarousel,
} from "./AuraAgentOutfitCarousel";
import AuraAgentOldStyleOutfitCard, {
  buildAuraLookFromAgentOutfit,
  getAgentOutfitCardWidth,
  prepareAuraAgentOldStyleOutfitCardModel,
  shouldShowSelectedPill,
} from "./AuraAgentOldStyleOutfitCard";

jest.mock("@/src/components/common/AppImage", () => {
  const React = require("react");
  const { Image } = require("react-native");
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => React.createElement(Image, props),
  };
});

jest.mock("@/src/components/aura/AuraPressable", () => {
  const React = require("react");
  const { Pressable } = require("react-native");
  return {
    __esModule: true,
    default: ({
      children,
      disabled,
      onPress,
      style,
      ...props
    }: {
      children?: React.ReactNode | ((state: { pressed: boolean; hovered: boolean }) => React.ReactNode);
      disabled?: boolean;
      onPress?: () => void;
      style?: unknown | ((state: { pressed: boolean; hovered: boolean }) => unknown);
    }) =>
      React.createElement(
        Pressable,
        {
          ...props,
          disabled,
          onPress,
          style: typeof style === "function" ? style({ pressed: false, hovered: false }) : style,
        },
        typeof children === "function" ? children({ pressed: false, hovered: false }) : children,
      ),
  };
});

jest.mock("@/src/components/aura/AuraLookCard", () => {
  const React = require("react");
  const { Text, View } = require("react-native");
  return {
    AuraLookCard: ({
      look,
      boardVariant,
      titleAccessory,
    }: {
      look: { lookTitle: string; pieces: { itemName: string }[] };
      boardVariant?: string;
      titleAccessory?: React.ReactNode;
    }) =>
      React.createElement(
        View,
        { testID: "mock-old-aura-look-card" },
        React.createElement(Text, null, look.lookTitle),
        boardVariant ? React.createElement(Text, null, `board:${boardVariant}`) : null,
        titleAccessory,
        look.pieces.map((piece) => React.createElement(Text, { key: piece.itemName }, piece.itemName)),
      ),
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

const outfit: AuraAgentOutfit = {
  outfitId: "outfit-raw-id",
  title: "Polished Office Black Loafers",
  vibe: "clean",
  occasion: "office",
  formality: "smart_casual",
  explanation:
    "Light blue linen shirt, black trousers, and penny loafers create a polished office fit without going too formal.",
  confidence: 0.91,
  scoreBreakdown: { total: 0.88, diagnostics: "debug-only" },
  stylingTips: ["Cuff the sleeves once.", "Keep the belt simple."],
  missingItems: ["navy topcoat"],
  items: [
    {
      itemId: "top-item-raw-id",
      role: "top",
      canonicalRole: "top",
      sourceRole: "top",
      reason: "Keeps the look office-appropriate and polished.",
      name: "Light blue Relaxed Fit Linen-blend shirt",
      category: "shirt",
      subcategory: "linen shirt",
      brand: "H&M",
      colors: ["blue", "white"],
      imageUrl: "https://example.com/top.png",
    },
    {
      itemId: "bottom-item-raw-id",
      role: "bottom",
      reason: "Creates a clean smart-casual base.",
      name: "Black straight trousers",
      category: "trousers",
      subcategory: "straight trousers",
      brand: "H&M",
      colors: ["black"],
      imageUrl: null,
    },
    {
      itemId: "shoe-item-raw-id",
      role: "footwear",
      reason: "Satisfies the black shoes request and elevates the outfit.",
      name: "Dress Penny Loafers",
      category: "loafer",
      subcategory: "loafer",
      brand: "Zara",
      colors: ["black", "brown"],
      imageUrl: "https://example.com/shoes.png",
    },
  ],
};

const actions: AuraAgentSuggestedAction[] = [
  {
    id: "explain-outfit",
    label: "Explain this outfit",
    type: "explain",
    payload: { mode: "explain_outfit" },
  },
];

const agentResponse: AuraAgentResponse = {
  mode: "generate_outfit",
  intent: {
    mode: "generate_outfit",
    query: "style me",
    normalizedQuery: "style me",
    confidence: 0.9,
    reason: "test",
    constraints: {
      formality: "smart_casual",
      preferredColors: [],
      requiredColors: [],
      requiredCategories: [],
      styleHints: [],
      avoidItemIds: [],
      avoidCategories: [],
      avoidTerms: [],
      selectedItemIds: [],
    },
  },
  message: "I found one closet-based option.",
  suggestedActions: [],
  outfits: [outfit],
};

const multiOutfitResponse: AuraAgentResponse = {
  ...agentResponse,
  requestedCount: 3,
  outfits: [
    outfit,
    {
      ...outfit,
      outfitId: "outfit-2",
      title: "Soft Office Layers",
      explanation: "Second outfit explanation.",
    },
    {
      ...outfit,
      outfitId: "outfit-3",
      title: "Minimal Dinner Fit",
      explanation: "Third outfit explanation.",
    },
  ],
};

describe("AuraAgentOldStyleOutfitCard", () => {
  it("renders the old AuraLookCard visual as the primary card", () => {
    const { getByTestId, getByText } = render(
      <AuraAgentOldStyleOutfitCard colors={Colors.dark} outfit={outfit} />,
    );

    expect(getByTestId("aura-agent-old-style-visual-card")).toBeTruthy();
    expect(getByTestId("mock-old-aura-look-card")).toBeTruthy();
    expect(getByText("Polished Office Black Loafers")).toBeTruthy();
    expect(getByText("board:chat")).toBeTruthy();
  });

  it("maps agent outfit items to old Aura look pieces without raw ids", () => {
    const look = buildAuraLookFromAgentOutfit(outfit);
    const serialized = JSON.stringify(look);

    expect(look.pieces.map((piece) => piece.role)).toEqual(["top", "bottom", "shoes"]);
    expect(serialized).not.toContain("top-item-raw-id");
    expect(serialized).not.toContain("canonicalRole");
    expect(serialized).not.toContain("sourceRole");
    expect(serialized).not.toContain("aiMetadata");
  });

  it("keeps item reasons hidden until Why this works is opened", () => {
    const { getByText, queryByText } = render(
      <AuraAgentOldStyleOutfitCard colors={Colors.dark} outfit={outfit} />,
    );

    expect(queryByText("Keeps the look office-appropriate and polished.")).toBeNull();

    fireEvent.press(getByText("Why this works"));

    expect(getByText("Keeps the look office-appropriate and polished.")).toBeTruthy();
  });

  it("renders action rail below the old card when actions are provided", () => {
    const onAction = jest.fn();
    const { getByText } = render(
      <AuraAgentOldStyleOutfitCard
        colors={Colors.dark}
        outfit={outfit}
        actions={actions}
        onAction={onAction}
      />,
    );

    fireEvent.press(getByText("Explain this outfit"));

    expect(onAction).toHaveBeenCalledWith(actions[0]);
  });

  it("calls onSelect when the card is tapped", () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <AuraAgentOldStyleOutfitCard
        colors={Colors.dark}
        outfit={outfit}
        selected
        showSelectedIndicator
        onSelect={onSelect}
      />,
    );

    fireEvent.press(getByLabelText("Selected outfit, Polished Office Black Loafers"));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("hides selected UI for a selected single outfit", () => {
    const { queryByLabelText, queryByText } = render(
      <AuraAgentOldStyleOutfitCard
        colors={Colors.dark}
        outfit={outfit}
        selected
        showSelectedIndicator={false}
      />,
    );

    expect(queryByText("Selected")).toBeNull();
    expect(queryByLabelText("Selected outfit")).toBeNull();
    expect(queryByLabelText("checkmark-circle")).toBeNull();
  });

  it("renders the selected pill outside the collage when multiple outfits can be selected", () => {
    const { getByLabelText, getByText, queryByLabelText } = render(
      <AuraAgentOldStyleOutfitCard
        colors={Colors.dark}
        outfit={outfit}
        selected
        showSelectedIndicator
      />,
    );

    expect(getByText("Selected")).toBeTruthy();
    expect(getByLabelText("Selected outfit")).toBeTruthy();
    expect(queryByLabelText("checkmark-circle")).toBeNull();
  });

  it("does not render the selected pill for unselected multi-outfit cards", () => {
    const { getByLabelText, queryByText } = render(
      <AuraAgentOldStyleOutfitCard
        colors={Colors.dark}
        outfit={outfit}
        selected={false}
        showSelectedIndicator
      />,
    );

    expect(queryByText("Selected")).toBeNull();
    expect(getByLabelText("Select outfit, Polished Office Black Loafers")).toBeTruthy();
  });

  it("keeps diagnostics out of the prepared production model", () => {
    const model = prepareAuraAgentOldStyleOutfitCardModel(outfit);
    const serialized = JSON.stringify(model);

    expect(serialized).not.toContain("scoreBreakdown");
    expect(serialized).not.toContain("debug-only");
  });

  it("does not show dev details by default", () => {
    const { queryByText } = render(
      <AuraAgentOldStyleOutfitCard
        colors={Colors.dark}
        outfit={outfit}
      />,
    );

    expect(queryByText("Dev details")).toBeNull();
  });

  it("does not show agent diagnostics by default", () => {
    const { queryByText } = render(
      <AuraAgentMessage
        colors={Colors.dark}
        response={{
          ...agentResponse,
          diagnostics: {
            graphRunId: "debug-run",
            runner: "langgraph",
          },
        }}
      />,
    );

    expect(queryByText("Dev details")).toBeNull();
  });

  it("targets a near full-width agent card with safe side margins", () => {
    expect(getAgentOutfitCardWidth(393)).toBe(369);
    expect(getAgentOutfitCardWidth(430, 16)).toBe(398);
  });

  it("only shows selected pill when both selection and multi-outfit indicator are active", () => {
    expect(shouldShowSelectedPill(true, true)).toBe(true);
    expect(shouldShowSelectedPill(true, false)).toBe(false);
    expect(shouldShowSelectedPill(false, true)).toBe(false);
  });

  it("formats carousel selection helpers", () => {
    expect(shouldRenderAgentOutfitCarousel(1)).toBe(false);
    expect(shouldRenderAgentOutfitCarousel(3)).toBe(true);
    expect(getAgentCarouselPageLabel(0, 3)).toBe("1 of 3");
    expect(getAgentCarouselPageLabel(2, 3)).toBe("3 of 3");
    expect(getCurrentAgentCarouselOutfit(multiOutfitResponse.outfits ?? [], "outfit-2")?.outfitId).toBe("outfit-2");
  });

  it("keeps single-outfit actions pointed at the internally selected first outfit", () => {
    const onAction = jest.fn();
    const { getByText, queryByText } = render(
      <AuraAgentMessage
        colors={Colors.dark}
        response={agentResponse}
        onAction={onAction}
      />,
    );

    expect(queryByText("Selected")).toBeNull();

    fireEvent.press(getByText("Save Preference"));

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-save-preference" }),
      outfit,
    );
  });

  it("renders an agent message when persisted actions are missing", () => {
    const responseWithoutActions = {
      ...agentResponse,
      suggestedActions: undefined,
    } as unknown as AuraAgentResponse;

    const { getByText } = render(
      <AuraAgentMessage
        colors={Colors.dark}
        response={responseWithoutActions}
      />,
    );

    expect(getByText("Polished Office Black Loafers")).toBeTruthy();
    expect(getByText("Save Preference")).toBeTruthy();
  });

  it("renders an agent message when item images are missing", () => {
    const responseWithoutImages = {
      ...agentResponse,
      outfits: [
        {
          ...outfit,
          items: outfit.items.map((item) => ({ ...item, imageUrl: null })),
        },
      ],
    };

    const { getByText } = render(
      <AuraAgentMessage
        colors={Colors.dark}
        response={responseWithoutImages}
      />,
    );

    expect(getByText("Polished Office Black Loafers")).toBeTruthy();
    expect(getByText("Dress Penny Loafers")).toBeTruthy();
  });

  it("renders multiple returned outfits in a carousel with one details section", () => {
    const { getByTestId, getByText, queryAllByText, queryByText } = render(
      <AuraAgentMessage
        colors={Colors.dark}
        response={multiOutfitResponse}
      />,
    );

    expect(getByTestId("aura-agent-outfit-carousel")).toBeTruthy();
    expect(getByText("1 of 3")).toBeTruthy();
    expect(queryAllByText("Why this works")).toHaveLength(1);
    expect(queryByText("Selected")).toBeNull();
  });

  it("uses the selected multi-outfit card for actions", () => {
    const onAction = jest.fn();
    const { getByText } = render(
      <AuraAgentMessage
        colors={Colors.dark}
        response={multiOutfitResponse}
        selectedOutfitId="outfit-2"
        onAction={onAction}
      />,
    );

    fireEvent.press(getByText("Save Preference"));

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-save-preference" }),
      expect.objectContaining({ outfitId: "outfit-2" }),
    );
  });

  it("decorates action state for the currently selected outfit only", () => {
    const onAction = jest.fn();
    const { getByText, queryByText } = render(
      <AuraAgentMessage
        colors={Colors.dark}
        response={multiOutfitResponse}
        selectedOutfitId="outfit-2"
        agentActionStates={{
          "outfit-1": { saved: true },
          "outfit-2": { moreLikeThis: true },
        }}
        onAction={onAction}
      />,
    );

    expect(queryByText("Saved")).toBeNull();
    expect(getByText("Preference saved")).toBeTruthy();
    fireEvent.press(getByText("Wore This"));

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-wear-feedback" }),
      expect.objectContaining({ outfitId: "outfit-2" }),
    );
  });

  it("updates selected outfit, details, and actions when the carousel page changes", () => {
    const onAction = jest.fn();
    const onSelectOutfit = jest.fn();
    const { getByTestId, getByText } = render(
      <AuraAgentMessage
        colors={Colors.dark}
        response={multiOutfitResponse}
        onAction={onAction}
        onSelectOutfit={onSelectOutfit}
      />,
    );

    fireEvent(getByTestId("aura-agent-outfit-carousel"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: 9999 } },
    });
    fireEvent.press(getByText("Why this works"));
    fireEvent.press(getByText("Save Preference"));

    expect(getByText("3 of 3")).toBeTruthy();
    expect(getByText("Third outfit explanation.")).toBeTruthy();
    expect(onSelectOutfit).toHaveBeenCalledWith(expect.objectContaining({ outfitId: "outfit-3" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-save-preference" }),
      expect.objectContaining({ outfitId: "outfit-3" }),
    );
  });
});
