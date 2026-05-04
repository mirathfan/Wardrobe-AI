import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import Reanimated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextLayoutEventData,
  View,
} from "react-native";

import { Colors, Fonts, type AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { getAttachmentGroupingLabel } from "@/src/lib/auraIntent";

import type { ChatAttachment, ChatAttachmentGroupRole } from "./chatTypes";

const BASE_COMPOSER_HEIGHT = 50;
const BASE_INPUT_HEIGHT = 34;
const MAX_INPUT_LINES = 5;
const INPUT_LINE_HEIGHT = 19;
const INPUT_PADDING_TOP = Platform.OS === "ios" ? 7 : 5;
const INPUT_PADDING_BOTTOM = Platform.OS === "ios" ? 1 : 1;
const INPUT_VERTICAL_PADDING = INPUT_PADDING_TOP + INPUT_PADDING_BOTTOM;
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * MAX_INPUT_LINES + INPUT_VERTICAL_PADDING;
const INPUT_SLOT_VERTICAL_PADDING = 8;
const BASE_ROW_HEIGHT = BASE_COMPOSER_HEIGHT - 8;
const MAX_INPUT_SLOT_HEIGHT = MAX_INPUT_HEIGHT + INPUT_SLOT_VERTICAL_PADDING;
const ATTACHMENT_THUMB_SIZE = 76;
const COMPOSER_RADIUS = 25;
const ATTACHMENT_COMPOSER_RADIUS = 24;
const ATTACHMENT_MENU_WIDTH = 216;
const ATTACHMENT_MENU_LEFT = 0;
const ATTACHMENT_MENU_GAP = 12;
const ATTACHMENT_MENU_CARET_LEFT = 17;
const inputPalette = Colors.dark;

function slotHeightFromLineCount(lineCount: number) {
  const nextLineCount = Math.max(1, Math.min(MAX_INPUT_LINES, lineCount));
  const nextInputHeight = nextLineCount * INPUT_LINE_HEIGHT + INPUT_VERTICAL_PADDING;
  return Math.min(
    MAX_INPUT_SLOT_HEIGHT,
    Math.max(BASE_ROW_HEIGHT, nextInputHeight + INPUT_SLOT_VERTICAL_PADDING),
  );
}

export default function InputBar({
  colors,
  value,
  loading,
  active,
  bottom,
  restingBottom,
  placeholder = "Ask AURA about a look, piece, or plan.",
  onChangeText,
  onFocusChange,
  onHeightChange,
  onSend,
  onStop,
  onPickImages,
  onTakePhoto,
  onRemoveAttachment,
  attachmentRole,
  onAttachmentRoleChange,
  onMicPress,
  recording,
  attachments = [],
}: {
  colors: AppColors;
  value: string;
  loading: boolean;
  active: boolean;
  bottom: number;
  restingBottom?: number;
  placeholder?: string;
  onChangeText: (next: string) => void;
  onFocusChange: (focused: boolean) => void;
  onHeightChange?: (height: number) => void;
  onSend: () => void;
  onStop?: () => void;
  onPickImages: () => void;
  onTakePhoto: () => void;
  onRemoveAttachment: (id: string) => void;
  attachmentRole: ChatAttachmentGroupRole;
  onAttachmentRoleChange: (role: ChatAttachmentGroupRole) => void;
  onMicPress: () => void;
  recording?: boolean;
  attachments?: ChatAttachment[];
}) {
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !loading;
  const canStop = loading && !!onStop;
  const composerSideInset = 10;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [composerHeight, setComposerHeight] = React.useState(BASE_COMPOSER_HEIGHT);
  const [inputSlotHeight, setInputSlotHeight] = React.useState(BASE_ROW_HEIGHT);
  const focusAnim = React.useRef(new Animated.Value(active ? 1 : 0)).current;
  const liveKeyboard = useAnimatedKeyboard();
  const restingBottomValue = useSharedValue(restingBottom ?? bottom);
  const menuAnim = React.useRef(new Animated.Value(0)).current;
  const sendVisibilityAnim = React.useRef(new Animated.Value(canSend ? 1 : 0)).current;
  const sendMotionAnim = React.useRef(new Animated.Value(0)).current;
  const inputRef = React.useRef<TextInput>(null);
  const initialValueRef = React.useRef(value);
  const lastAppliedHeightRef = React.useRef(BASE_ROW_HEIGHT);
  const nativeValueRef = React.useRef(value);
  const mirroredPropValueRef = React.useRef(value);
  const showSendControl = canSend && !recording;

  React.useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: active ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active, focusAnim]);

  const keyboardTrackingGap = Platform.OS === "ios" ? 10 : 6;

  React.useEffect(() => {
    restingBottomValue.value = restingBottom ?? bottom;
  }, [bottom, restingBottom, restingBottomValue]);

  const liveBottomStyle = useAnimatedStyle(() => {
    const keyboardHeight = Math.max(0, liveKeyboard.height.value);
    return {
      bottom:
        keyboardHeight > 1
          ? Math.max(14, keyboardHeight + keyboardTrackingGap)
          : restingBottomValue.value,
    };
  }, [keyboardTrackingGap]);

  React.useEffect(() => {
    if (menuOpen) {
      Animated.spring(menuAnim, {
        toValue: 1,
        damping: 16,
        stiffness: 190,
        mass: 0.72,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 130,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [menuAnim, menuOpen]);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(sendVisibilityAnim, {
        toValue: showSendControl ? 1 : 0,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [sendVisibilityAnim, showSendControl]);

  const hasAttachments = attachments.length > 0;
  const imageAttachmentCount = attachments.filter((attachment) => attachment.type === "image").length;
  const hasSingleImageAttachment = attachments.length === 1 && attachments[0]?.type === "image";
  const showAutoDetectAttachmentMode = imageAttachmentCount > 1;
  const [attachmentModeSelectorOpen, setAttachmentModeSelectorOpen] = React.useState(false);
  const [hasAttachmentModeOverride, setHasAttachmentModeOverride] = React.useState(false);
  const showAttachmentModeSelector = showAutoDetectAttachmentMode && attachmentModeSelectorOpen;
  const shellRadius = hasAttachments ? ATTACHMENT_COMPOSER_RADIUS : COMPOSER_RADIUS;
  const attachmentRailHeight = hasAttachments
    ? showAttachmentModeSelector
      ? 150
      : showAutoDetectAttachmentMode
        ? 116
        : 88
    : 0;
  const estimatedComposerHeight =
    BASE_COMPOSER_HEIGHT + attachmentRailHeight + Math.max(0, inputSlotHeight - BASE_ROW_HEIGHT);
  const lastReportedHeightRef = React.useRef(0);

  const reportComposerHeight = React.useCallback(
    (height: number) => {
      const nextHeight = Math.max(BASE_COMPOSER_HEIGHT, Math.ceil(height));
      if (Math.abs(nextHeight - lastReportedHeightRef.current) <= 1) return;
      lastReportedHeightRef.current = nextHeight;
      setComposerHeight(nextHeight);
      onHeightChange?.(nextHeight);
    },
    [onHeightChange],
  );

  const applyInputSlotHeight = React.useCallback((nextSlotHeight: number) => {
    if (!Number.isFinite(nextSlotHeight) || nextSlotHeight <= 0) return;
    if (Math.abs(lastAppliedHeightRef.current - nextSlotHeight) < 2) return;
    lastAppliedHeightRef.current = nextSlotHeight;
    setInputSlotHeight((current) => (Math.abs(current - nextSlotHeight) < 2 ? current : nextSlotHeight));
    reportComposerHeight(
      BASE_COMPOSER_HEIGHT + attachmentRailHeight + Math.max(0, nextSlotHeight - BASE_ROW_HEIGHT),
    );
  }, [attachmentRailHeight, reportComposerHeight]);

  const resetInputHeight = React.useCallback(() => {
    if (lastAppliedHeightRef.current === BASE_ROW_HEIGHT) return;
    lastAppliedHeightRef.current = BASE_ROW_HEIGHT;
    setInputSlotHeight(BASE_ROW_HEIGHT);
    reportComposerHeight(BASE_COMPOSER_HEIGHT + attachmentRailHeight);
  }, [attachmentRailHeight, reportComposerHeight]);

  React.useEffect(() => {
    const isExternalValueChange =
      value !== mirroredPropValueRef.current && value !== nativeValueRef.current;
    mirroredPropValueRef.current = value;
    if (!isExternalValueChange) return;

    nativeValueRef.current = value;
    inputRef.current?.setNativeProps({ text: value });
    if (!value) {
      resetInputHeight();
    }
  }, [resetInputHeight, value]);

  React.useEffect(() => {
    if (!value) {
      resetInputHeight();
    }
  }, [resetInputHeight, value]);

  React.useEffect(() => {
    reportComposerHeight(estimatedComposerHeight);
  }, [estimatedComposerHeight, reportComposerHeight]);

  React.useEffect(() => {
    if (imageAttachmentCount <= 1) {
      setAttachmentModeSelectorOpen(false);
      setHasAttachmentModeOverride(false);
    }
    if (hasSingleImageAttachment && attachmentRole !== "reference") {
      onAttachmentRoleChange("reference");
    }
  }, [attachmentRole, hasSingleImageAttachment, imageAttachmentCount, onAttachmentRoleChange]);

  React.useEffect(() => {
    if (!showAutoDetectAttachmentMode || hasAttachmentModeOverride || attachmentRole === "reference") return;
    onAttachmentRoleChange("reference");
  }, [attachmentRole, hasAttachmentModeOverride, onAttachmentRoleChange, showAutoDetectAttachmentMode]);

  function handleAttachmentRoleOverride(role: ChatAttachmentGroupRole) {
    setHasAttachmentModeOverride(true);
    onAttachmentRoleChange(role);
  }

  const shellStyle = {
    borderRadius: shellRadius,
    backgroundColor: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(31,8,45,0.16)", "rgba(42,13,58,0.24)"],
    }),
    shadowOpacity: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.04, 0.08],
    }),
    shadowRadius: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [10, 16],
    }),
  } as const;

  const glassTintStyle = {
    backgroundColor: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(251,228,216,0.028)", "rgba(223,182,178,0.045)"],
    }),
  } as const;

  const menuTrayStyle = {
    opacity: menuAnim,
    transform: [
      {
        translateY: menuAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
      {
        translateX: menuAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-7, 0],
        }),
      },
      {
        scale: menuAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.92, 1],
        }),
      },
    ],
  } as const;

  const sendOpacity = sendVisibilityAnim;
  const sendScale = sendVisibilityAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });
  const sendIconColor = canSend ? colors.ctaText : colors.text;
  const showPlaceholder = !value;
  const idleIconColor = "rgba(251,228,216,0.62)";
  const plusIconColor = menuOpen ? colors.ctaCream : "rgba(251,228,216,0.78)";
  const inputShouldScroll = inputSlotHeight >= MAX_INPUT_SLOT_HEIGHT - 1;
  const micOpacity = sendVisibilityAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 0],
  });
  const micScale = sendVisibilityAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.92],
  });

  function handleMeasuredTextLayout(event: NativeSyntheticEvent<TextLayoutEventData>) {
    if (!value) {
      resetInputHeight();
      return;
    }
    applyInputSlotHeight(slotHeightFromLineCount(event.nativeEvent.lines.length));
  }

  function handleComposerPress() {
    setMenuOpen(false);
  }

  function handleTextChange(next: string) {
    nativeValueRef.current = next;
    onChangeText(next);
    if (!next) {
      resetInputHeight();
    }
  }

  function handleSendPress() {
    if (!canSend || loading) return;
    Animated.sequence([
      Animated.timing(sendMotionAnim, {
        toValue: -6,
        duration: 90,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sendMotionAnim, {
        toValue: 0,
        duration: 120,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    setMenuOpen(false);
    resetInputHeight();
    onSend();
  }

  function handleShellLayout(event: LayoutChangeEvent) {
    reportComposerHeight(event.nativeEvent.layout.height);
  }

  return (
    <Reanimated.View
      onLayout={handleShellLayout}
      pointerEvents="box-none"
      style={[
        styles.shell,
        {
          left: composerSideInset,
          right: composerSideInset,
        },
        liveBottomStyle,
      ]}
    >
      {menuOpen ? (
        <Pressable
          accessibilityLabel="Close attachment menu"
          accessibilityRole="button"
          onPress={() => setMenuOpen(false)}
          style={[
            styles.menuDismissLayer,
            {
              left: -composerSideInset - 16,
              right: -composerSideInset - 16,
            },
          ]}
        />
      ) : null}
      <Animated.View
        pointerEvents={menuOpen ? "auto" : "none"}
        style={[
          styles.menuPopover,
          {
            left: ATTACHMENT_MENU_LEFT,
            bottom: composerHeight + ATTACHMENT_MENU_GAP,
          },
          menuTrayStyle,
        ]}
      >
        <View style={styles.menuPopoverCard}>
          <BlurView intensity={Platform.OS === "ios" ? 76 : 58} tint="dark" style={StyleSheet.absoluteFill} />
          <LinearGradient
            pointerEvents="none"
            colors={[
              "rgba(255,255,255,0.095)",
              "rgba(251,228,216,0.035)",
              "rgba(75,26,96,0.10)",
              "rgba(0,0,0,0.14)",
            ]}
            locations={[0, 0.34, 0.7, 1]}
            start={{ x: 0.08, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.menuPopoverTint} />
          <AttachmentOption
            label="Photo Library"
            icon="images-outline"
            onPress={() => {
              setMenuOpen(false);
              onPickImages();
            }}
            colors={colors}
          />
          <View style={styles.menuDivider} />
          <AttachmentOption
            label="Camera"
            icon="camera-outline"
            onPress={() => {
              setMenuOpen(false);
              onTakePhoto();
            }}
            colors={colors}
          />
        </View>
        <View pointerEvents="none" style={styles.menuCaret} />
      </Animated.View>
      <Animated.View style={[styles.shellSurface, { borderRadius: shellRadius }, shellStyle]}>
      <BlurView intensity={Platform.OS === "ios" ? 68 : 44} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        pointerEvents="none"
        colors={[
          "rgba(255,255,255,0.105)",
          "rgba(251,228,216,0.035)",
          "rgba(89,35,121,0.075)",
          "rgba(0,0,0,0.10)",
        ]}
        locations={[0, 0.32, 0.68, 1]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.glassTint,
          { borderRadius: shellRadius },
          glassTintStyle,
        ]}
      />
      <Pressable
        onPress={handleComposerPress}
        style={[styles.chrome, hasAttachments ? styles.chromeWithAttachments : null]}
      >
        {hasAttachments ? (
          <View style={styles.attachmentRail}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.attachmentItems}
            >
              {attachments.map((attachment) => (
                <View key={attachment.id} style={styles.attachmentThumb}>
                  {attachment.type === "image" ? (
                    <Image
                      source={{ uri: attachment.localUri ?? attachment.uri }}
                      resizeMode="cover"
                      style={StyleSheet.absoluteFill}
                    />
                  ) : (
                    <View style={styles.attachmentFallback}>
                      <Ionicons name="mic" size={16} color={colors.text} />
                    </View>
                  )}
                  <AuraPressable
                    onPress={() => onRemoveAttachment(attachment.id)}
                    pressedScale={0.92}
                    pressedOpacity={0.86}
                    style={styles.removeAttachmentButton}
                  >
                    <Ionicons name="close" size={12} color={colors.text} />
                  </AuraPressable>
                </View>
              ))}
            </ScrollView>
            {showAutoDetectAttachmentMode ? (
              <View style={styles.attachmentModeRow}>
                <AuraPressable
                  onPress={() => setAttachmentModeSelectorOpen((current) => !current)}
                  haptic="selection"
                  hapticTrigger="press"
                  pressedScale={0.97}
                  pressedOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Auto-detect attachment grouping"
                  style={[
                    styles.autoDetectChip,
                    !hasAttachmentModeOverride ? styles.autoDetectChipActive : null,
                  ]}
                >
                  <Ionicons
                    name={attachmentModeSelectorOpen ? "chevron-up" : "sparkles-outline"}
                    size={12}
                    color={hasAttachmentModeOverride ? "rgba(244,248,255,0.68)" : "#F4FBFF"}
                  />
                  <Text
                    style={[
                      styles.autoDetectText,
                      !hasAttachmentModeOverride ? styles.autoDetectTextActive : null,
                    ]}
                  >
                    Auto-detect
                  </Text>
                </AuraPressable>
              </View>
            ) : null}
            {showAttachmentModeSelector ? (
              <View style={styles.attachmentOverrideRow}>
                <AuraPressable
                  onPress={() => {
                    setHasAttachmentModeOverride(false);
                    onAttachmentRoleChange("reference");
                  }}
                  haptic="selection"
                  hapticTrigger="press"
                  pressedScale={0.97}
                  pressedOpacity={0.88}
                  style={[
                    styles.attachmentRoleChip,
                    !hasAttachmentModeOverride ? styles.attachmentRoleChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.attachmentRoleText,
                      !hasAttachmentModeOverride ? styles.attachmentRoleTextActive : null,
                    ]}
                  >
                    Auto
                  </Text>
                </AuraPressable>
                {(["same_item", "separate_items", "reference"] as const).map((role) => (
                  <AuraPressable
                    key={role}
                    onPress={() => handleAttachmentRoleOverride(role)}
                    haptic="selection"
                    hapticTrigger="press"
                    pressedScale={0.97}
                    pressedOpacity={0.88}
                    style={[
                      styles.attachmentRoleChip,
                      hasAttachmentModeOverride && attachmentRole === role ? styles.attachmentRoleChipActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.attachmentRoleText,
                        hasAttachmentModeOverride && attachmentRole === role ? styles.attachmentRoleTextActive : null,
                      ]}
                    >
                      {getAttachmentGroupingLabel(role)}
                    </Text>
                  </AuraPressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.row, { minHeight: inputSlotHeight }]}>
          <View style={styles.iconLane}>
            <AuraPressable
              onPress={() => setMenuOpen((prev) => !prev)}
              hitSlop={10}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.95}
              pressedOpacity={0.9}
              style={[
                styles.sideButton,
                menuOpen ? styles.sideButtonActive : null,
              ]}
            >
              <Ionicons name={menuOpen ? "close" : "add"} size={14} color={plusIconColor} />
            </AuraPressable>
          </View>

          <View style={[styles.inputSlot, { height: inputSlotHeight }]}>
            {showPlaceholder ? (
              <View pointerEvents="none" style={styles.placeholderLayer}>
                <Text numberOfLines={1} style={[styles.placeholderText, { color: colors.textSecondary }]}>
                  {placeholder}
                </Text>
              </View>
            ) : null}
            <TextInput
              ref={inputRef}
              defaultValue={initialValueRef.current}
              onChangeText={handleTextChange}
              onFocus={() => onFocusChange(true)}
              onBlur={() => onFocusChange(false)}
              onSubmitEditing={() => {
                if (canSend) handleSendPress();
              }}
              placeholder=""
              multiline
              blurOnSubmit={false}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              returnKeyType="send"
              keyboardAppearance="dark"
              scrollEnabled={inputShouldScroll}
              selectionColor={colors.aiAccent}
              cursorColor={colors.aiAccent}
              maxLength={600}
              textAlignVertical="top"
              style={styles.input}
            />
            {value ? (
              <Text
                pointerEvents="none"
                onTextLayout={handleMeasuredTextLayout}
                style={styles.inputMeasure}
              >
                {value.endsWith("\n") ? `${value} ` : value}
              </Text>
            ) : null}
          </View>

          <View style={styles.iconLane}>
            <AuraPressable
              onPress={canStop ? onStop : recording ? onMicPress : canSend ? handleSendPress : onMicPress}
              disabled={loading && !canStop}
              hitSlop={10}
              haptic={canStop ? "selection" : recording ? "selection" : canSend ? "light" : "selection"}
              hapticTrigger="press"
              pressedScale={0.95}
              pressedOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={
                canStop ? "Stop generating" : recording ? "Stop dictation" : canSend ? "Send message" : "Dictate message"
              }
              style={[
                styles.sideButton,
                styles.trailingButton,
                canStop ? styles.trailingButtonStop : recording ? null : canSend ? styles.trailingButtonSend : null,
                recording ? styles.trailingButtonRecording : null,
                loading && !canStop ? styles.sideButtonDisabled : null,
              ]}
            >
              {canStop ? (
                <Ionicons name="square" size={12} color={colors.text} />
              ) : (
                <>
                  <Animated.View
                    style={{
                      position: "absolute",
                      opacity: micOpacity,
                      transform: [{ scale: micScale }],
                    }}
                  >
                    <Ionicons
                      name={recording ? "stop" : "mic-outline"}
                      size={15}
                      color={recording ? "#ff8f8f" : idleIconColor}
                    />
                  </Animated.View>
                  <Animated.View
                    style={{
                      opacity: sendOpacity,
                      transform: [{ scale: sendScale }, { translateY: sendMotionAnim }],
                    }}
                  >
                    <Ionicons name="arrow-up" size={15} color={sendIconColor} />
                  </Animated.View>
                </>
              )}
            </AuraPressable>
          </View>
        </View>
      </Pressable>
      </Animated.View>
    </Reanimated.View>
  );
}

function AttachmentOption({
  label,
  icon,
  onPress,
  colors,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  colors: AppColors;
}) {
  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.96}
      pressedOpacity={0.88}
      style={styles.attachmentOption}
    >
      <Ionicons name={icon} size={16} color={colors.text} />
      <Text style={styles.attachmentOptionText}>{label}</Text>
    </AuraPressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "absolute",
    zIndex: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  shellSurface: {
    overflow: "hidden",
    borderWidth: 0,
    borderRadius: 999,
    zIndex: 2,
  },
  glassTint: {
    borderRadius: 999,
  },
  chrome: {
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 4,
  },
  chromeWithAttachments: {
    paddingHorizontal: 7,
    paddingTop: 7,
    paddingBottom: 5,
  },
  attachmentRail: {
    gap: 7,
    paddingHorizontal: 1,
    paddingBottom: 7,
  },
  attachmentRoleChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: inputPalette.chipBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(251,228,216,0.10)",
  },
  attachmentRoleChipActive: {
    backgroundColor: inputPalette.purpleSurface,
    borderColor: inputPalette.purpleBorder,
  },
  attachmentRoleText: {
    color: "rgba(251,228,216,0.68)",
    fontSize: 10,
    fontWeight: "800",
  },
  attachmentRoleTextActive: {
    color: inputPalette.ctaCream,
  },
  attachmentItems: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 4,
  },
  attachmentThumb: {
    width: ATTACHMENT_THUMB_SIZE,
    height: ATTACHMENT_THUMB_SIZE,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: inputPalette.chipBackground,
    borderWidth: 1,
    borderColor: "rgba(251,228,216,0.10)",
  },
  attachmentFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  removeAttachmentButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4,5,9,0.68)",
    borderWidth: 1,
    borderColor: "rgba(251,228,216,0.18)",
  },
  attachmentModeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  autoDetectChip: {
    minHeight: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: inputPalette.chipBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(251,228,216,0.10)",
  },
  autoDetectChipActive: {
    backgroundColor: inputPalette.purpleSurface,
    borderColor: inputPalette.purpleBorder,
  },
  autoDetectText: {
    color: "rgba(251,228,216,0.68)",
    fontSize: 10.5,
    fontWeight: "800",
  },
  autoDetectTextActive: {
    color: inputPalette.ctaCream,
  },
  attachmentOverrideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  menuDismissLayer: {
    position: "absolute",
    top: -2000,
    bottom: -300,
    zIndex: 1,
  },
  menuPopover: {
    position: "absolute",
    width: ATTACHMENT_MENU_WIDTH,
    zIndex: 3,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  menuPopoverCard: {
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(251,228,216,0.16)",
    backgroundColor: "rgba(38,16,54,0.74)",
    padding: 5,
  },
  menuPopoverTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(223,182,178,0.025)",
  },
  menuCaret: {
    position: "absolute",
    left: ATTACHMENT_MENU_CARET_LEFT,
    bottom: -6,
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: "rgba(38,16,54,0.92)",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(251,228,216,0.13)",
    transform: [{ rotate: "45deg" }],
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
    backgroundColor: "rgba(251,228,216,0.08)",
  },
  attachmentOption: {
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  attachmentOptionText: {
    color: inputPalette.text,
    fontSize: 12.5,
    fontWeight: "800",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    borderRadius: COMPOSER_RADIUS,
    borderWidth: 0,
    paddingHorizontal: 0,
    minHeight: BASE_COMPOSER_HEIGHT - 8,
  },
  iconLane: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    height: BASE_ROW_HEIGHT,
  },
  sideButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251,228,216,0.065)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(251,228,216,0.12)",
  },
  sideButtonActive: {
    backgroundColor: "rgba(223,182,178,0.16)",
    borderColor: "rgba(251,228,216,0.22)",
  },
  trailingButton: {
    position: "relative",
  },
  trailingButtonSend: {
    backgroundColor: inputPalette.ctaCream,
    borderColor: "rgba(251,228,216,0.18)",
    shadowColor: inputPalette.ctaCream,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  trailingButtonStop: {
    backgroundColor: inputPalette.secondaryCta,
    borderColor: "rgba(251,228,216,0.16)",
  },
  trailingButtonRecording: {
    backgroundColor: "rgba(255,99,99,0.18)",
  },
  sideButtonPressed: {
    opacity: 0.82,
  },
  sideButtonDisabled: {
    opacity: 0.48,
  },
  inputSlot: {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    justifyContent: "flex-start",
    alignItems: "stretch",
    minHeight: BASE_ROW_HEIGHT,
    paddingTop: 4,
    paddingBottom: 4,
    position: "relative",
    overflow: "hidden",
  },
  placeholderLayer: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  placeholderText: {
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    lineHeight: INPUT_LINE_HEIGHT,
    includeFontPadding: false,
  },
  input: {
    width: "100%",
    minWidth: 0,
    flex: 1,
    flexShrink: 1,
    minHeight: BASE_INPUT_HEIGHT,
    maxHeight: MAX_INPUT_HEIGHT,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingTop: INPUT_PADDING_TOP,
    paddingBottom: INPUT_PADDING_BOTTOM,
    marginTop: 0,
    fontFamily: Fonts.sans,
    fontSize: 14.25,
    lineHeight: INPUT_LINE_HEIGHT,
    letterSpacing: 0.1,
    color: inputPalette.text,
    backgroundColor: "transparent",
    includeFontPadding: false,
    textAlignVertical: "top",
  },
  inputMeasure: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 4 + INPUT_PADDING_TOP,
    opacity: 0,
    fontFamily: Fonts.sans,
    fontSize: 14.25,
    lineHeight: INPUT_LINE_HEIGHT,
    letterSpacing: 0.1,
    includeFontPadding: false,
  },
});
