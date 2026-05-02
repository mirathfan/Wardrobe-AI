import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
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
  TextInputContentSizeChangeEventData,
  View,
} from "react-native";

import { Fonts, type AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { getAttachmentGroupingLabel } from "@/src/lib/auraIntent";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

import type { ChatAttachment, ChatAttachmentGroupRole } from "./chatTypes";

const BASE_COMPOSER_HEIGHT = 48;
const BASE_INPUT_HEIGHT = 32;
const MAX_INPUT_LINES = 6;
const INPUT_LINE_HEIGHT = 19;
const INPUT_PADDING_TOP = Platform.OS === "ios" ? 8 : 5;
const INPUT_PADDING_BOTTOM = Platform.OS === "ios" ? 4 : 3;
const INPUT_VERTICAL_PADDING = INPUT_PADDING_TOP + INPUT_PADDING_BOTTOM;
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * MAX_INPUT_LINES + INPUT_PADDING_TOP + INPUT_PADDING_BOTTOM;
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const ATTACHMENT_THUMB_SIZE = 60;
const ATTACHMENT_COMPOSER_RADIUS = 28;
const ATTACHMENT_MENU_WIDTH = 248;
const ATTACHMENT_MENU_LEFT = 8;
const ATTACHMENT_MENU_GAP = 10;
const ATTACHMENT_MENU_CARET_LEFT = 14;

function clampInputHeight(height: number) {
  return Math.max(BASE_INPUT_HEIGHT, Math.min(MAX_INPUT_HEIGHT, height));
}

function heightFromContentSize(contentHeight: number) {
  const rawHeight = Math.max(0, Math.ceil(contentHeight));
  if (rawHeight <= BASE_INPUT_HEIGHT + 2) return BASE_INPUT_HEIGHT;
  const lineCount = Math.min(
    MAX_INPUT_LINES,
    Math.max(2, Math.ceil((rawHeight - INPUT_VERTICAL_PADDING) / INPUT_LINE_HEIGHT)),
  );
  return clampInputHeight(lineCount * INPUT_LINE_HEIGHT + INPUT_VERTICAL_PADDING);
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
  const layout = useResponsiveLayout();
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !loading;
  const canStop = loading && !!onStop;
  const composerSideInset = layout.screenSize === "compact" ? 12 : 16;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [inputHeight, setInputHeight] = React.useState(BASE_INPUT_HEIGHT);
  const [composerHeight, setComposerHeight] = React.useState(BASE_COMPOSER_HEIGHT);
  const focusAnim = React.useRef(new Animated.Value(active ? 1 : 0)).current;
  const liveKeyboard = useAnimatedKeyboard();
  const restingBottomValue = useSharedValue(restingBottom ?? bottom);
  const menuAnim = React.useRef(new Animated.Value(0)).current;
  const inputHeightAnim = React.useRef(new Animated.Value(BASE_INPUT_HEIGHT)).current;
  const sendVisibilityAnim = React.useRef(new Animated.Value(canSend ? 1 : 0)).current;
  const sendMotionAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: active ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active, focusAnim]);

  const keyboardTrackingGap = Platform.OS === "ios" ? 8 : 4;

  React.useEffect(() => {
    restingBottomValue.value = restingBottom ?? bottom;
  }, [bottom, restingBottom, restingBottomValue]);

  const liveBottomStyle = useAnimatedStyle(() => {
    const keyboardHeight = Math.max(0, liveKeyboard.height.value);
    return {
      bottom:
        keyboardHeight > 1
          ? Math.max(12, keyboardHeight + keyboardTrackingGap)
          : restingBottomValue.value,
    };
  }, [keyboardTrackingGap]);

  React.useEffect(() => {
    Animated.timing(menuAnim, {
      toValue: menuOpen ? 1 : 0,
      duration: 180,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [menuAnim, menuOpen]);

  React.useEffect(() => {
    Animated.timing(inputHeightAnim, {
      toValue: inputHeight,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [inputHeight, inputHeightAnim]);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(sendVisibilityAnim, {
        toValue: canSend ? 1 : 0,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [canSend, sendVisibilityAnim]);

  const hasAttachments = attachments.length > 0;
  const imageAttachmentCount = attachments.filter((attachment) => attachment.type === "image").length;
  const hasSingleImageAttachment = attachments.length === 1 && attachments[0]?.type === "image";
  const showAutoDetectAttachmentMode = imageAttachmentCount > 1;
  const [attachmentModeSelectorOpen, setAttachmentModeSelectorOpen] = React.useState(false);
  const [hasAttachmentModeOverride, setHasAttachmentModeOverride] = React.useState(false);
  const showAttachmentModeSelector = showAutoDetectAttachmentMode && attachmentModeSelectorOpen;
  const isInputExpanded = inputHeight > BASE_INPUT_HEIGHT + 2;
  const shellRadius = hasAttachments ? ATTACHMENT_COMPOSER_RADIUS : isInputExpanded ? 24 : 999;
  const attachmentRailHeight = hasAttachments
    ? showAttachmentModeSelector
      ? 122
      : showAutoDetectAttachmentMode
        ? 88
        : 65
    : 0;
  const rowHeightDelta = Math.max(0, inputHeight - BASE_INPUT_HEIGHT);
  const estimatedComposerHeight = BASE_COMPOSER_HEIGHT + attachmentRailHeight + rowHeightDelta;
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

  React.useEffect(() => {
    if (!value) {
      setInputHeight((current) => (current === BASE_INPUT_HEIGHT ? current : BASE_INPUT_HEIGHT));
    }
  }, [value]);

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
    borderColor: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(255,255,255,0.08)", "rgba(167,139,250,0.24)"],
    }),
    backgroundColor: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(255,255,255,0.06)", "rgba(255,255,255,0.075)"],
    }),
    shadowOpacity: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.16, 0.24],
    }),
    shadowRadius: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [18, 26],
    }),
  } as const;

  const glassTintStyle = {
    backgroundColor: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(255,255,255,0.015)", "rgba(167,139,250,0.045)"],
    }),
  } as const;

  const focusRimStyle = {
    borderColor: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(255,255,255,0.08)", "rgba(167,139,250,0.28)"],
    }),
    opacity: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.58, 1],
    }),
  } as const;

  const menuTrayStyle = {
    opacity: menuAnim,
    transform: [
      {
        translateY: menuAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0],
        }),
      },
      {
        scale: menuAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.97, 1],
        }),
      },
    ],
  } as const;

  const sendOpacity = sendVisibilityAnim;
  const sendScale = sendVisibilityAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });
  const sendIconColor = canSend ? "#10131A" : "#EAF6FF";
  const showPlaceholder = !value;
  const micOpacity = sendVisibilityAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const micScale = sendVisibilityAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.92],
  });

  function handleContentSizeChange(
    event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ) {
    const nextHeight = heightFromContentSize(event.nativeEvent.contentSize.height);
    if (Math.abs(nextHeight - inputHeight) > 1) {
      setInputHeight(nextHeight);
    }
  }

  function handleComposerPress() {
    setMenuOpen(false);
  }

  function handleTextChange(next: string) {
    onChangeText(next);
    if (!next) {
      setInputHeight(BASE_INPUT_HEIGHT);
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
    setInputHeight(BASE_INPUT_HEIGHT);
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
          <BlurView intensity={Platform.OS === "ios" ? 72 : 54} tint="dark" style={StyleSheet.absoluteFill} />
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
      <BlurView intensity={Platform.OS === "ios" ? 76 : 58} tint="dark" style={StyleSheet.absoluteFill} />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.glassTint,
          { borderRadius: shellRadius },
          glassTintStyle,
        ]}
      />
      <View pointerEvents="none" style={styles.topHighlight} />
      <View pointerEvents="none" style={styles.bottomShade} />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.focusRim,
          {
            borderRadius: shellRadius,
          },
          focusRimStyle,
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
                    <Ionicons name="close" size={12} color="#fff" />
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

        <Animated.View
          style={[
            styles.row,
            {
              minHeight: BASE_COMPOSER_HEIGHT - 14,
              alignItems: isInputExpanded ? "flex-end" : "center",
            },
          ]}
        >
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
              <Ionicons name={menuOpen ? "close" : "add"} size={16} color={colors.text} />
            </AuraPressable>
          </View>

          <Animated.View
            style={[
              styles.inputSlot,
              {
                height: inputHeightAnim,
                justifyContent: isInputExpanded ? "flex-start" : "center",
              },
            ]}
          >
            {showPlaceholder ? (
              <View pointerEvents="none" style={styles.placeholderLayer}>
                <Text numberOfLines={1} style={[styles.placeholderText, { color: colors.textSecondary }]}>
                  {placeholder}
                </Text>
              </View>
            ) : null}
            <AnimatedTextInput
              value={value}
              onChangeText={handleTextChange}
              onFocus={() => onFocusChange(true)}
              onBlur={() => onFocusChange(false)}
              onSubmitEditing={() => {
                if (canSend) handleSendPress();
              }}
              onContentSizeChange={handleContentSizeChange}
              placeholder=""
              multiline
              blurOnSubmit={false}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              returnKeyType="send"
              keyboardAppearance="dark"
              scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT - 1}
              selectionColor={colors.aiAccent}
              cursorColor={colors.aiAccent}
              maxLength={600}
              textAlignVertical="top"
              style={[
                styles.input,
                {
                  color: colors.text,
                  height: inputHeight,
                  maxHeight: MAX_INPUT_HEIGHT,
                  minHeight: BASE_INPUT_HEIGHT,
                },
              ]}
            />
          </Animated.View>

          <View style={styles.iconLane}>
            <AuraPressable
              onPress={canStop ? onStop : canSend ? handleSendPress : onMicPress}
              disabled={loading && !canStop}
              hitSlop={10}
              haptic={canStop ? "selection" : canSend ? "light" : "selection"}
              hapticTrigger="press"
              pressedScale={0.95}
              pressedOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={canStop ? "Stop generating" : canSend ? "Send message" : "Dictate message"}
              style={[
                styles.sideButton,
                styles.trailingButton,
                canStop ? styles.trailingButtonStop : canSend ? styles.trailingButtonSend : null,
                recording && !canSend ? styles.trailingButtonRecording : null,
                loading && !canStop ? styles.sideButtonDisabled : null,
              ]}
            >
              {canStop ? (
                <Ionicons name="square" size={13} color={colors.text} />
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
                      name={recording && !canSend ? "stop" : "mic-outline"}
                      size={17}
                      color={recording && !canSend ? "#ff8f8f" : colors.text}
                    />
                  </Animated.View>
                  <Animated.View
                    style={{
                      opacity: sendOpacity,
                      transform: [{ scale: sendScale }, { translateY: sendMotionAnim }],
                    }}
                  >
                    <Ionicons name="arrow-up" size={17} color={sendIconColor} />
                  </Animated.View>
                </>
              )}
            </AuraPressable>
          </View>
        </Animated.View>
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
    shadowColor: "#8B7CF6",
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  shellSurface: {
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 999,
    zIndex: 2,
  },
  glassTint: {
    borderRadius: 999,
  },
  topHighlight: {
    position: "absolute",
    left: 24,
    right: 24,
    top: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  bottomShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 14,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  focusRim: {
    borderWidth: 1,
  },
  chrome: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
  },
  chromeWithAttachments: {
    paddingHorizontal: 11,
    paddingTop: 8,
    paddingBottom: 6,
  },
  attachmentRail: {
    gap: 6,
    paddingHorizontal: 1,
    paddingBottom: 5,
  },
  attachmentRoleChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.038)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.065)",
  },
  attachmentRoleChipActive: {
    backgroundColor: "rgba(167,139,250,0.14)",
    borderColor: "rgba(167,139,250,0.24)",
  },
  attachmentRoleText: {
    color: "rgba(244,248,255,0.62)",
    fontSize: 10,
    fontWeight: "800",
  },
  attachmentRoleTextActive: {
    color: "#F4FBFF",
  },
  attachmentItems: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 4,
  },
  attachmentThumb: {
    width: ATTACHMENT_THUMB_SIZE,
    height: ATTACHMENT_THUMB_SIZE,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
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
    borderColor: "rgba(255,255,255,0.18)",
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
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  autoDetectChipActive: {
    backgroundColor: "rgba(167,139,250,0.10)",
    borderColor: "rgba(167,139,250,0.18)",
  },
  autoDetectText: {
    color: "rgba(244,248,255,0.68)",
    fontSize: 10.5,
    fontWeight: "800",
  },
  autoDetectTextActive: {
    color: "#F4FBFF",
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
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 24,
  },
  menuPopoverCard: {
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(18,18,27,0.78)",
    padding: 6,
  },
  menuPopoverTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(167,139,250,0.045)",
  },
  menuCaret: {
    position: "absolute",
    left: ATTACHMENT_MENU_CARET_LEFT,
    bottom: -5,
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: "rgba(24,24,33,0.92)",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    transform: [{ rotate: "45deg" }],
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
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
    color: "#F0F6FB",
    fontSize: 12.5,
    fontWeight: "800",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  iconLane: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  sideButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sideButtonActive: {
    backgroundColor: "rgba(167,139,250,0.14)",
    borderColor: "rgba(167,139,250,0.22)",
  },
  trailingButton: {
    position: "relative",
  },
  trailingButtonSend: {
    backgroundColor: "rgba(244,240,255,0.94)",
    borderColor: "rgba(255,255,255,0.72)",
    shadowColor: "#DED3F8",
    shadowOpacity: 0.34,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  trailingButtonStop: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.16)",
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
    borderRadius: 999,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    justifyContent: "center",
    minHeight: 32,
    position: "relative",
  },
  placeholderLayer: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 1,
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
    flexShrink: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingTop: INPUT_PADDING_TOP,
    paddingBottom: INPUT_PADDING_BOTTOM,
    marginTop: 0,
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    lineHeight: INPUT_LINE_HEIGHT,
    letterSpacing: 0.1,
    backgroundColor: "transparent",
    includeFontPadding: false,
    overflow: "hidden",
    textAlignVertical: "top",
  },
});
