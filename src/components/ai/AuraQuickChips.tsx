import { BlurView } from "expo-blur";
import React from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";

import { Fonts } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { useAppTheme } from "@/src/hooks/useAppTheme";

const TOP_CHIP_HEIGHT = 36;
const TOP_CHIP_RADIUS = 999;
const TOP_CHIP_GAP = 7;
const TOP_CHIP_HORIZONTAL_PADDING = 12;

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
      contentContainerStyle={{ gap: TOP_CHIP_GAP, paddingHorizontal: 16, paddingRight: 18 }}
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
          backgroundColor: colors.chipBackground,
          borderWidth: 1,
          borderColor: colors.border,
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
            color: colors.textSecondary,
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
  const isTrainingChip = label === "Train AURA faster";

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
          maxWidth: 188,
          height: TOP_CHIP_HEIGHT,
          minHeight: TOP_CHIP_HEIGHT,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: TOP_CHIP_HORIZONTAL_PADDING,
          paddingVertical: 0,
          borderRadius: TOP_CHIP_RADIUS,
          backgroundColor: isTrainingChip ? "rgba(72,36,76,0.44)" : "rgba(31,9,48,0.34)",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isTrainingChip ? "rgba(251,228,216,0.18)" : "rgba(251,228,216,0.09)",
          overflow: "hidden",
        }}
      >
        <BlurView intensity={16} tint="dark" style={StyleSheet.absoluteFill} />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isTrainingChip ? "rgba(223,182,178,0.035)" : "rgba(251,228,216,0.012)",
            },
          ]}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {isTrainingChip ? (
            <View
              style={{
                width: 4.5,
                height: 4.5,
                borderRadius: 999,
                backgroundColor: colors.ctaCream,
                shadowColor: colors.ctaCream,
                shadowOpacity: 0.2,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
          ) : null}
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              color: isTrainingChip ? colors.ctaCream : "rgba(251,228,216,0.72)",
              fontSize: 11.5,
              lineHeight: 16,
              fontWeight: "800",
              fontFamily: Fonts.sans,
            }}
          >
            {label}
          </Text>
        </View>
      </AuraPressable>
    </Animated.View>
  );
}
