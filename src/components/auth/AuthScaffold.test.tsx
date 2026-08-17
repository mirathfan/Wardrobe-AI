import React from "react";
import { render } from "@testing-library/react-native";

import { AuthInput } from "./AuthScaffold";

jest.mock("@/src/hooks/useAppTheme", () => ({
  useAppTheme: () => ({
    colors: {
      borderStrong: "#222",
      inputBackground: "#111",
      softPurple: "#a78bfa",
      text: "#fff",
      textMuted: "#999",
      textPrimary: "#fff",
      textSecondary: "#ccc",
    },
    theme: {
      typography: {
        eyebrow: {},
        wordmark: {},
      },
    },
  }),
}));

jest.mock("@/src/components/aura/AuraGlassCard", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/src/components/aura/AuraGlowBackground", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock("@/src/components/aura/AuraGradientButton", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ label }: { label: string }) => React.createElement(Text, null, label),
  };
});

jest.mock("@/src/components/SafeScreen", () => {
  const React = require("react");
  return {
    SafeScreen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

describe("AuthInput", () => {
  it("renders with maxLength 200 by default", () => {
    const { getByPlaceholderText } = render(<AuthInput placeholder="Email" />);

    expect(getByPlaceholderText("Email").props.maxLength).toBe(200);
  });

  it("renders with maxLength 128 when secureTextEntry is true", () => {
    const { getByPlaceholderText } = render(
      <AuthInput placeholder="Password" secureTextEntry />,
    );

    expect(getByPlaceholderText("Password").props.maxLength).toBe(128);
  });

  it("defaults accessibilityLabel to the placeholder", () => {
    const { getByPlaceholderText } = render(<AuthInput placeholder="First name" />);

    expect(getByPlaceholderText("First name").props.accessibilityLabel).toBe("First name");
  });
});
