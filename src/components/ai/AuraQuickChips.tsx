import React from "react";
import { Animated, ScrollView, StyleSheet, View } from "react-native";

import AuraPressable from "@/src/components/aura/AuraPressable";
import { AuraText, auraDesignTokens } from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";

const TOP_CHIP_HEIGHT = 34;
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
          borderRadius: auraDesignTokens.radii.sm,
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.borderSoft,
          paddingHorizontal: 10,
          paddingVertical: 7,
          justifyContent: "center",
        }}
      >
        <AuraText variant="caption" style={{ fontSize: 12, fontWeight: "600" }}>
          {item.title}
        </AuraText>
        <AuraText
          variant="metadata"
          tone="secondary"
          style={{
            fontSize: 10.5,
            lineHeight: 13,
            marginTop: 1,
          }}
        >
          {item.subtitle}
        </AuraText>
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
          backgroundColor: isTrainingChip ? colors.surfaceElevated : colors.surfaceMuted,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isTrainingChip ? colors.borderStrong : colors.borderSoft,
          overflow: "hidden",
        }}
      >
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isTrainingChip ? colors.accentSoft : colors.surfaceMuted,
              opacity: isTrainingChip ? 0.24 : 0.12,
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
          <AuraText
            numberOfLines={1}
            ellipsizeMode="tail"
            variant="metadata"
            tone={isTrainingChip ? "accent" : "secondary"}
            style={{
              fontSize: 11.5,
              lineHeight: 16,
              fontWeight: "500",
            }}
          >
            {label}
          </AuraText>
        </View>
      </AuraPressable>
    </Animated.View>
  );
}
