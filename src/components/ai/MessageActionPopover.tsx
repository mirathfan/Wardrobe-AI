import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Fonts, type AppColors } from "@/constants/theme";
import { auraDesignTokens } from "@/src/components/ui/auraStylePrimitives";
import { runHaptic } from "@/src/lib/haptics";

import type { ChatMessageActionAnchor } from "./chatTypes";

const MENU_WIDTH = 178;
const ROW_HEIGHT = 42;
const CARD_VERTICAL_PADDING = 5;
const DIVIDER_HEIGHT = StyleSheet.hairlineWidth;
const SCREEN_MARGIN = 12;
const ANCHOR_GAP = 10;

export type MessageAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
};

type MessageActionPopoverProps = {
  visible: boolean;
  anchor: ChatMessageActionAnchor | null;
  actions: MessageAction[];
  colors: AppColors;
  screenWidth: number;
  screenHeight: number;
  keyboardHeight: number;
  topInset: number;
  bottomInset: number;
  onDismiss: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMenuPosition({
  actionCount,
  anchor,
  bottomInset,
  keyboardHeight,
  screenHeight,
  screenWidth,
  topInset,
}: {
  actionCount: number;
  anchor: ChatMessageActionAnchor | null;
  bottomInset: number;
  keyboardHeight: number;
  screenHeight: number;
  screenWidth: number;
  topInset: number;
}) {
  const menuHeight =
    CARD_VERTICAL_PADDING * 2 +
    actionCount * ROW_HEIGHT +
    Math.max(0, actionCount - 1) * DIVIDER_HEIGHT;
  const safeTop = Math.max(SCREEN_MARGIN, topInset + 8);
  const keyboardTop = keyboardHeight > 0
    ? screenHeight - keyboardHeight - SCREEN_MARGIN
    : screenHeight - Math.max(bottomInset, SCREEN_MARGIN) - SCREEN_MARGIN;
  const maxTop = Math.max(safeTop, keyboardTop - menuHeight);
  const fallbackY = keyboardHeight > 0 ? keyboardTop - menuHeight - ANCHOR_GAP : screenHeight - menuHeight - 156;
  const anchorWidth = Math.max(0, anchor?.width ?? 0);
  const anchorHeight = Math.max(0, anchor?.height ?? 0);
  const anchorX = anchor ? anchor.pageX + anchorWidth / 2 : screenWidth / 2;
  const anchorTop = anchor?.pageY ?? fallbackY;
  const anchorBottom = anchor ? anchor.pageY + anchorHeight : fallbackY;
  const preferredTop =
    anchorBottom + menuHeight + ANCHOR_GAP <= keyboardTop
      ? anchorBottom + ANCHOR_GAP
      : anchorTop - menuHeight - ANCHOR_GAP;
  const left = clamp(anchorX - MENU_WIDTH / 2, SCREEN_MARGIN, screenWidth - MENU_WIDTH - SCREEN_MARGIN);
  const top = clamp(preferredTop, safeTop, maxTop);
  const opensBelow = preferredTop >= anchorBottom;
  return { left, top, opensBelow };
}

export default function MessageActionPopover({
  visible,
  anchor,
  actions,
  colors,
  screenWidth,
  screenHeight,
  keyboardHeight,
  topInset,
  bottomInset,
  onDismiss,
}: MessageActionPopoverProps) {
  const appear = React.useRef(new Animated.Value(0)).current;
  const position = React.useMemo(
    () =>
      getMenuPosition({
        actionCount: actions.length,
        anchor,
        bottomInset,
        keyboardHeight,
        screenHeight,
        screenWidth,
        topInset,
      }),
    [actions.length, anchor, bottomInset, keyboardHeight, screenHeight, screenWidth, topInset],
  );
  const transformOriginX = React.useMemo(() => {
    const anchorCenterX = anchor ? anchor.pageX + Math.max(0, anchor.width ?? 0) / 2 : position.left + MENU_WIDTH / 2;
    return clamp(anchorCenterX - position.left, 24, MENU_WIDTH - 24);
  }, [anchor, position.left]);

  React.useEffect(() => {
    if (!visible || actions.length === 0) {
      appear.setValue(0);
      return;
    }
    appear.setValue(0);
    Animated.spring(appear, {
      toValue: 1,
      damping: 17,
      stiffness: 230,
      mass: 0.72,
      useNativeDriver: true,
    }).start();
  }, [actions.length, appear, visible]);

  if (!visible || actions.length === 0) return null;

  const animatedMenuStyle = {
    opacity: appear.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
    transform: [
      { translateX: transformOriginX },
      {
        translateY: appear.interpolate({
          inputRange: [0, 1],
          outputRange: [position.opensBelow ? -6 : 6, 0],
        }),
      },
      {
        scale: appear.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
        }),
      },
      { translateX: -transformOriginX },
    ],
  } as const;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          accessibilityLabel="Dismiss message actions"
          accessibilityRole="button"
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[
            styles.menuShell,
            {
              left: position.left,
              top: position.top,
              backgroundColor: colors.surfaceGlass,
              borderColor: colors.border,
            },
            animatedMenuStyle,
          ]}
        >
          <BlurView intensity={Platform.OS === "ios" ? 68 : 52} tint="dark" style={StyleSheet.absoluteFill} />
          <LinearGradient
            pointerEvents="none"
            colors={[
              "rgba(255,255,255,0.085)",
              "rgba(251,228,216,0.032)",
              "rgba(34,31,40,0.20)",
              "rgba(0,0,0,0.16)",
            ]}
            locations={[0, 0.34, 0.72, 1]}
            start={{ x: 0.06, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.glassTint} />
          {actions.map((action, index) => (
            <React.Fragment key={action.key}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <MessageActionRow action={action} colors={colors} />
            </React.Fragment>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

function MessageActionRow({
  action,
  colors,
}: {
  action: MessageAction;
  colors: AppColors;
}) {
  return (
    <Pressable
      disabled={action.disabled}
      onPress={() => {
        void runHaptic("selection");
        action.onPress();
      }}
      style={({ pressed }) => [
        styles.actionRow,
        {
          backgroundColor: pressed ? "rgba(255,255,255,0.075)" : "transparent",
          opacity: action.disabled ? 0.46 : 1,
        },
      ]}
    >
      <Ionicons name={action.icon} size={17} color={colors.textSecondary} />
      <Text numberOfLines={1} style={[styles.actionLabel, { color: colors.text }]}>
        {action.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menuShell: {
    position: "absolute",
    width: MENU_WIDTH,
    overflow: "hidden",
    borderRadius: auraDesignTokens.radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: CARD_VERTICAL_PADDING,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 22,
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(223,182,178,0.055)",
  },
  actionRow: {
    height: ROW_HEIGHT,
    borderRadius: auraDesignTokens.radii.sm,
    marginHorizontal: 5,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionLabel: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: "600",
  },
  divider: {
    height: DIVIDER_HEIGHT,
    marginHorizontal: 14,
    backgroundColor: "rgba(251,228,216,0.09)",
  },
});
