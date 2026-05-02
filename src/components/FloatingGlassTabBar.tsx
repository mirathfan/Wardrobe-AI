import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReduceMotion } from "@/hooks/useReduceMotion";
import { runHaptic } from "@/src/lib/haptics";
import {
  DOCK_HEIGHT,
  DOCK_RADIUS,
  DOCK_SIDE_MARGIN,
  floatingTabBarBottomInset,
} from "../constants/dock";
import { useAppTheme } from "../hooks/useAppTheme";

const TAB_META: Record<
  string,
  { label: string; icon?: keyof typeof Ionicons.glyphMap; auraMark?: boolean }
> = {
  index: { label: "Home", icon: "home-outline" },
  closet: { label: "Closet", icon: "shirt-outline" },
  ai: { label: "AURA", auraMark: true },
  calendar: { label: "Calendar", icon: "calendar-outline" },
  profile: { label: "Profile", icon: "person-circle-outline" },
};

const ROW_HORIZONTAL_PADDING = 7;
const ACTIVE_BUBBLE_WIDTH = 64;
const ACTIVE_BUBBLE_HEIGHT = 52;
const AURA_TAB_MARK = require("../../assets/images/aura-tab-mark.png");

type ExpoRouterTabOptions = {
  href?: string | null;
};

function getFocusedIcon(name: keyof typeof Ionicons.glyphMap) {
  if (name === "home-outline") return "home";
  if (name === "calendar-outline") return "calendar";
  if (name === "shirt-outline") return "shirt";
  if (name === "person-circle-outline") return "person-circle";
  return name;
}

export default function FloatingGlassTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const dockBottom = floatingTabBarBottomInset(insets.bottom);

  const visibleRoutes = useMemo(
    () =>
      state.routes.filter((route) => {
        const options = descriptors[route.key]?.options as
          | ExpoRouterTabOptions
          | undefined;
        if (options?.href === null) return false;
        return !!TAB_META[route.name];
      }),
    [descriptors, state.routes],
  );

  const currentKey = state.routes[state.index]?.key;
  const currentRoute = state.routes[state.index];
  const hiddenRouteSourceTab =
    (currentRoute?.params as { sourceTab?: string } | undefined)?.sourceTab ??
    null;

  const focusedVisibleIndex = Math.max(
    0,
    visibleRoutes.findIndex(
      (route) =>
        route.key === currentKey || route.name === hiddenRouteSourceTab,
    ),
  );

  const activeIndex = useSharedValue(focusedVisibleIndex);
  const bubbleScale = useSharedValue(1);
  const reduceMotion = useReduceMotion();
  const availableDockWidth = Math.max(
    0,
    windowWidth - DOCK_SIDE_MARGIN * 2 - ROW_HORIZONTAL_PADDING * 2,
  );
  const tabWidth = visibleRoutes.length
    ? availableDockWidth / visibleRoutes.length
    : 0;
  const scrimColors = useMemo(
    () =>
      [
        "rgba(10,10,15,0)",
        isDark ? "rgba(10,10,15,0.10)" : "rgba(255,255,255,0.10)",
        isDark ? "rgba(10,10,15,0.24)" : "rgba(255,255,255,0.26)",
      ] as const,
    [isDark],
  );
  const materialFillStyle = useMemo(
    () => ({
      backgroundColor: isDark
        ? "rgba(10, 10, 16, 0.52)"
        : "rgba(255, 255, 255, 0.50)",
    }),
    [isDark],
  );

  useEffect(() => {
    if (reduceMotion) {
      activeIndex.value = focusedVisibleIndex;
      bubbleScale.value = 1;
      return;
    }

    bubbleScale.value = withTiming(1.08, { duration: 90 }, (finished) => {
      if (finished) {
        bubbleScale.value = withSpring(1, {
          damping: 16,
          stiffness: 180,
          mass: 0.9,
        });
      }
    });

    activeIndex.value = withSpring(focusedVisibleIndex, {
      damping: 18,
      stiffness: 180,
      mass: 0.9,
    });
  }, [activeIndex, bubbleScale, focusedVisibleIndex, reduceMotion]);

  const activeBubbleStyle = useAnimatedStyle(() => {
    const scale = bubbleScale.value;
    const scaledWidth = ACTIVE_BUBBLE_WIDTH * scale;
    const scaledHeight = ACTIVE_BUBBLE_HEIGHT * scale;
    const translateX =
      ROW_HORIZONTAL_PADDING +
      activeIndex.value * tabWidth +
      (tabWidth - scaledWidth) / 2;
    const translateY = (ACTIVE_BUBBLE_HEIGHT - scaledHeight) / 2;

    return {
      transform: [{ translateX }, { translateY }, { scale }],
    };
  }, [tabWidth]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
      <LinearGradient
        pointerEvents="none"
        colors={scrimColors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.scrim, { bottom: dockBottom }]}
      />

      <View style={[styles.container, { bottom: dockBottom }]}>
        <BlurView
          intensity={46}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />

        <View
          pointerEvents="none"
          style={[
            styles.materialFill,
            materialFillStyle,
          ]}
        />

        <View
          pointerEvents="none"
          style={[
            styles.glassBorder,
            {
              borderColor: isDark
                ? "rgba(255,255,255,0.11)"
                : "rgba(255,255,255,0.58)",
            },
          ]}
        />

        <View pointerEvents="none" style={styles.topHighlight} />
        <View pointerEvents="none" style={styles.bottomShade} />

        <View style={styles.row}>
          <Reanimated.View
            pointerEvents="none"
            style={[
              styles.activeBubble,
              activeBubbleStyle,
              {
                opacity: visibleRoutes.length ? 1 : 0,
              },
            ]}
          />

          {visibleRoutes.map((route, index) => {
            const isFocused = index === focusedVisibleIndex;
            const meta = TAB_META[route.name] ?? {
              label: route.name,
              icon: "ellipse-outline" as const,
            };

            const iconName = meta.icon
              ? isFocused
                ? getFocusedIcon(meta.icon)
                : meta.icon
              : "ellipse-outline";

            const color = isFocused ? "#FFFFFF" : "rgba(235,235,245,0.56)";

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                void runHaptic("selection");
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: "tabLongPress",
                target: route.key,
              });
            };

            return (
              <TabBarItem
                key={route.key}
                isFocused={isFocused}
                iconName={iconName}
                iconSize={route.name === "ai" ? 23 : 21}
                label={meta.label}
                color={color}
                auraMark={meta.auraMark}
                onPress={onPress}
                onLongPress={onLongPress}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const TabBarItem = React.memo(function TabBarItem({
  isFocused,
  iconName,
  iconSize,
  label,
  color,
  auraMark,
  onPress,
  onLongPress,
}: {
  isFocused: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  iconSize: number;
  label: string;
  color: string;
  auraMark?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const iconScale = useSharedValue(isFocused ? 1.02 : 1);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      iconScale.value = isFocused ? 1.02 : 1;
      return;
    }

    iconScale.value = isFocused
      ? withSpring(1.02, { damping: 14, stiffness: 220 })
      : withTiming(1, { duration: 140 });
  }, [iconScale, isFocused, reduceMotion]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value * pressScale.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      onPressIn={() => {
        if (reduceMotion) return;
        pressScale.value = withTiming(0.94, { duration: 90 });
      }}
      onPressOut={() => {
        if (reduceMotion) return;
        pressScale.value = withSpring(1, { damping: 16, stiffness: 220 });
      }}
      onLongPress={onLongPress}
      style={styles.item}
    >
      <Reanimated.View style={[styles.iconWrap, iconStyle]}>
        {auraMark ? (
          <AuraTabMark active={isFocused} />
        ) : (
          <Ionicons name={iconName} size={iconSize} color={color} />
        )}
      </Reanimated.View>

      <Text
        style={[
          styles.label,
          {
            color,
            opacity: isFocused ? 1 : 0.62,
            fontWeight: isFocused ? "600" : "500",
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    height: DOCK_HEIGHT + 8,
  },
  container: {
    position: "absolute",
    left: DOCK_SIDE_MARGIN,
    right: DOCK_SIDE_MARGIN,
    height: DOCK_HEIGHT,
    borderRadius: DOCK_RADIUS,
    overflow: "hidden",
    backgroundColor: "rgba(10,10,16,0.44)",
    shadowColor: "#000",
    shadowOpacity: 0.09,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  materialFill: {
    ...StyleSheet.absoluteFillObject,
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: DOCK_RADIUS,
  },
  topHighlight: {
    position: "absolute",
    top: 1,
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  bottomShade: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 0,
    height: 12,
    backgroundColor: "rgba(0,0,0,0.08)",
    borderBottomLeftRadius: DOCK_RADIUS,
    borderBottomRightRadius: DOCK_RADIUS,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ROW_HORIZONTAL_PADDING,
    position: "relative",
  },
  item: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    zIndex: 1,
  },
  activeBubble: {
    position: "absolute",
    top: 3,
    width: ACTIVE_BUBBLE_WIDTH,
    height: ACTIVE_BUBBLE_HEIGHT,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    zIndex: 0,
  },
  iconWrap: {
    width: 30,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  label: {
    fontSize: 10.3,
    letterSpacing: 0,
    zIndex: 1,
  },
  auraMarkWrap: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  auraTabImage: {
    width: 30,
    height: 30,
  },
});

const AuraTabMark = React.memo(function AuraTabMark({ active }: { active: boolean }) {
  return (
    <View style={styles.auraMarkWrap}>
      <Image
        source={AURA_TAB_MARK}
        resizeMode="contain"
        style={[styles.auraTabImage, { opacity: active ? 1 : 0.62 }]}
      />
    </View>
  );
});
