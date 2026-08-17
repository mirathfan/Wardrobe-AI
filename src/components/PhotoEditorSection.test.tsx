import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { PhotoEditorSection } from "./PhotoEditorSection";

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Ionicons: ({ name }: { name: string }) => React.createElement(Text, null, name),
  };
});

jest.mock("@/src/hooks/useAppTheme", () => ({
  useAppTheme: () => ({
    colors: {
      background: "#000",
      boardLight: "#eee",
      border: "#333",
      chipBackground: "#111",
      ctaCream: "#f5d7c6",
      ctaText: "#120012",
      danger: "#ff4d4f",
      lightPurple: "#c4b5fd",
      text: "#fff",
      textSecondary: "#ccc",
      warning: "#fbbf24",
    },
  }),
}));

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof PhotoEditorSection>> = {},
) {
  return render(
    <PhotoEditorSection
      previewUri="file://preview.jpg"
      isProcessing={false}
      canRefine={false}
      showPendingNote={false}
      onPickLibrary={jest.fn()}
      onUseCamera={jest.fn()}
      onRemove={jest.fn()}
      {...overrides}
    />,
  );
}

describe("PhotoEditorSection AI Polish action", () => {
  it("calls the explicit polish action when tapped", () => {
    const onPolishProduct = jest.fn();
    const { getByText } = renderEditor({
      productPolishActionState: "available",
      productPolishActionHelper: "3 beta runs included",
      onPolishProduct,
    });

    fireEvent.press(getByText("Polish image"));

    expect(onPolishProduct).toHaveBeenCalledTimes(1);
    expect(getByText("3 beta runs included")).toBeTruthy();
  });

  it("shows neutral coming-soon copy without a polish button for unavailable users", () => {
    const { getByText, queryByText } = renderEditor({
      productPolishActionState: "unavailable",
    });

    expect(getByText("Coming soon")).toBeTruthy();
    expect(getByText("We’re fine-tuning image polish for Early Access.")).toBeTruthy();
    expect(queryByText("Polish image")).toBeNull();
  });

  it("keeps the friendly polish failure visible in review", () => {
    const { getByText } = renderEditor({
      productPolishActionState: "available",
      productPolishError: "Polish didn’t complete. Your original preview is still saved.",
      onPolishProduct: jest.fn(),
    });

    expect(getByText("Polish didn’t complete. Your original preview is still saved.")).toBeTruthy();
  });
});
