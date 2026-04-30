import React from "react";
import { Animated, ScrollView, Text } from "react-native";

import { Fonts } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { useAppTheme } from "@/src/hooks/useAppTheme";

import { auraTheme } from "./aiTheme";

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
  const source = variant === "cards" && items?.length ? items : chips;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingRight: 22 }}
    >
      {source.map((item, index) =>
        typeof item === "string" ? (
          <Chip key={`${item}-${index}`} label={item} onPress={onPress} colors={colors} index={index} />
        ) : (
          <ChipCard key={item.prompt} item={item} onPress={onPress} colors={colors} index={index} />
        )
      )}
    </ScrollView>
  );
}

function ChipCard({
  item,
  onPress,
  colors,
  index,
}: {
  item: { title: string; subtitle: string; prompt: string };
  onPress: (chip: string) => void;
  colors: ReturnType<typeof useAppTheme>["colors"];
  index: number;
}) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(6)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        delay: index * 30,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        delay: index * 30,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <AuraPressable
        onPress={() => onPress(item.prompt)}
        haptic="selection"
        hapticTrigger="press"
        pressedScale={0.96}
        pressedOpacity={0.9}
        style={{
          width: 164,
          minHeight: 46,
          borderRadius: 15,
          backgroundColor: "rgba(255,255,255,0.018)",
          borderWidth: 1,
          borderColor: auraTheme.borderSoft,
          paddingHorizontal: 10,
          paddingVertical: 7,
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700", fontFamily: Fonts.sans }}>
          {item.title}
        </Text>
        <Text
          style={{
            color: auraTheme.textMuted,
            fontSize: 10.5,
            lineHeight: 13,
            marginTop: 1,
            fontFamily: Fonts.sans,
          }}
        >
          {item.subtitle}
        </Text>
      </AuraPressable>
    </Animated.View>
  );
}

function Chip({
  label,
  onPress,
  colors,
  index,
}: {
  label: string;
  onPress: (chip: string) => void;
  colors: ReturnType<typeof useAppTheme>["colors"];
  index: number;
}) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(6)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        delay: index * 30,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        delay: index * 30,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <AuraPressable
        onPress={() => onPress(label)}
        haptic="selection"
        hapticTrigger="press"
        pressedScale={0.96}
        pressedOpacity={0.9}
        style={{
          maxWidth: 210,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.018)",
          borderWidth: 1,
          borderColor: auraTheme.borderSoft,
        }}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ color: auraTheme.textMuted, fontSize: 10.5, fontWeight: "600", fontFamily: Fonts.sans }}
        >
          {label}
        </Text>
      </AuraPressable>
    </Animated.View>
  );
}
