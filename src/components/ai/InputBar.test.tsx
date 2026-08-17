/* eslint-disable @typescript-eslint/no-require-imports */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { Text, TextInput, View } from "react-native";

import { Colors } from "@/constants/theme";

import InputBar from "./InputBar";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
}));

jest.mock("expo-blur", () => ({
  BlurView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
}));

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    interpolate: jest.fn(() => 1),
    useAnimatedKeyboard: () => ({ height: { value: 0 } }),
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown) => value,
  };
});

jest.mock("@/hooks/useReduceMotion", () => ({
  useReduceMotion: () => true,
}));

jest.mock("@/src/lib/haptics", () => ({
  runHaptic: jest.fn(),
}));

function InputBarHarness({ onSend }: { onSend: jest.Mock }) {
  const [value, setValue] = React.useState("give me a date outfit");
  return (
    <InputBar
      colors={Colors.dark}
      value={value}
      loading={false}
      active={false}
      bottom={16}
      onChangeText={setValue}
      onFocusChange={jest.fn()}
      onSend={() => {
        onSend();
        setValue("");
      }}
      onPickImages={jest.fn()}
      onTakePhoto={jest.fn()}
      onRemoveAttachment={jest.fn()}
      attachmentRole="reference"
      onAttachmentRoleChange={jest.fn()}
      onMicPress={jest.fn()}
    />
  );
}

describe("InputBar", () => {
  it("sends and clears controlled text without requiring setNativeProps", () => {
    const onSend = jest.fn();
    const screen = render(<InputBarHarness onSend={onSend} />);

    expect(screen.UNSAFE_getByType(TextInput).props.value).toBe("give me a date outfit");

    fireEvent.press(screen.getByLabelText("Send message"));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.UNSAFE_getByType(TextInput).props.value).toBe("");
  });
});
