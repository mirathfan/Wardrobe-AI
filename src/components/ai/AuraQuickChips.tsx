import React from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";

import { Fonts } from "@/constants/theme";
import { useAppTheme } from "@/src/hooks/useAppTheme";

const DEFAULT_CHIPS = [
  "What should I wear today?",
  "Build a fit for tonight",
  "Style this item",
  "What am I missing?",
];

export default function AuraQuickChips({
  chips = DEFAULT_CHIPS,
  items,
  variant = "pills",
  onPress,
}: {
  chips?: string[];
  items?: { title: string; subtitle: string; prompt: string }[];
  variant?: "pills" | "cards";
  onPress: (chip: string) => void;
}) {
  const { colors } = useAppTheme();

  if (variant === "cards" && items?.length) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 14, paddingHorizontal: 20, paddingRight: 30 }}
      >
        {items.map((item) => (
          <ChipCard key={item.prompt} item={item} onPress={onPress} colors={colors} />
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {chips.map((chip) => (
        <Chip key={chip} label={chip} onPress={onPress} colors={colors} />
      ))}
    </View>
  );
}

function ChipCard({
  item,
  onPress,
  colors,
}: {
  item: { title: string; subtitle: string; prompt: string };
  onPress: (chip: string) => void;
  colors: ReturnType<typeof useAppTheme>["colors"];
}) {
  const scale = React.useRef(new Animated.Value(1)).current;

  function animateTo(value: number) {
    Animated.timing(scale, {
      toValue: value,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={() => onPress(item.prompt)}
        onPressIn={() => animateTo(0.98)}
        onPressOut={() => animateTo(1)}
        style={{
          width: 286,
          minHeight: 104,
          borderRadius: 28,
          backgroundColor: "rgba(255,255,255,0.062)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
          paddingHorizontal: 18,
          paddingVertical: 16,
          justifyContent: "flex-end",
          shadowColor: "#000",
          shadowOpacity: 0.13,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 10 },
        }}
      >
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700", fontFamily: Fonts.sans }}>
          {item.title}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13.5, lineHeight: 18, marginTop: 4, fontFamily: Fonts.sans }}>
          {item.subtitle}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function Chip({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: (chip: string) => void;
  colors: ReturnType<typeof useAppTheme>["colors"];
}) {
  const scale = React.useRef(new Animated.Value(1)).current;

  function animateTo(value: number) {
    Animated.timing(scale, {
      toValue: value,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        key={label}
        onPress={() => onPress(label)}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        style={{
          paddingHorizontal: 13,
          paddingVertical: 7,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.03)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
        }}
      >
        <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: "600", fontFamily: Fonts.sans }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
