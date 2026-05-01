import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React from "react";
import {
  Animated,
  Easing,
  Image,
  NativeSyntheticEvent,
  Platform,
  Pressable,
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
import { auraTheme } from "./aiTheme";

const BASE_COMPOSER_HEIGHT = 50;
const BASE_INPUT_HEIGHT = 30;
const MAX_INPUT_LINES = 4;
const INPUT_LINE_HEIGHT = 20;
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * MAX_INPUT_LINES;
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export default function InputBar({
  colors,
  value,
  loading,
  active,
  bottom,
  placeholder = "Ask AURA about a look, piece, or plan.",
  onChangeText,
  onFocusChange,
  onHeightChange,
  onSend,
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
  placeholder?: string;
  onChangeText: (next: string) => void;
  onFocusChange: (focused: boolean) => void;
  onHeightChange?: (height: number) => void;
  onSend: () => void;
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
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [inputHeight, setInputHeight] = React.useState(BASE_INPUT_HEIGHT);
  const focusAnim = React.useRef(new Animated.Value(active ? 1 : 0)).current;
  const bottomAnim = React.useRef(new Animated.Value(bottom)).current;
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

  React.useEffect(() => {
    Animated.timing(bottomAnim, {
      toValue: bottom,
      duration: Platform.OS === "ios" ? 220 : 160,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [bottom, bottomAnim]);

  React.useEffect(() => {
    Animated.timing(menuAnim, {
      toValue: menuOpen ? 1 : 0,
      duration: 180,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
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

  const attachmentRailHeight = attachments.length > 0 ? 58 : 0;
  const menuHeight = menuOpen ? 70 : 0;
  const rowHeightDelta = Math.max(0, inputHeight - BASE_INPUT_HEIGHT);
  const estimatedComposerHeight = BASE_COMPOSER_HEIGHT + attachmentRailHeight + menuHeight + rowHeightDelta;

  React.useEffect(() => {
    if (!value) {
      setInputHeight((current) => (current === BASE_INPUT_HEIGHT ? current : BASE_INPUT_HEIGHT));
    }
  }, [value]);

  React.useEffect(() => {
    onHeightChange?.(estimatedComposerHeight);
  }, [estimatedComposerHeight, onHeightChange]);

  const shellStyle = {
    bottom: bottomAnim,
    borderRadius: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [22, 20],
    }),
    borderColor: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(255,245,234,0.09)", "rgba(167,139,250,0.34)"],
    }),
    backgroundColor: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(14,17,24,0.9)", "rgba(18,21,28,0.96)"],
    }),
    shadowOpacity: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.14, 0.22],
    }),
    shadowRadius: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [12, 18],
    }),
    transform: [
      {
        scale: focusAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.015],
        }),
      },
      {
        translateY: focusAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -1],
        }),
      },
    ],
  } as const;

  const menuTrayStyle = {
    maxHeight: menuAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 78],
    }),
    opacity: menuAnim,
    transform: [
      {
        translateY: menuAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0],
        }),
      },
    ],
  } as const;

  const sendOpacity = sendVisibilityAnim;
const sendScale = sendVisibilityAnim.interpolate({
  inputRange: [0, 1],
  outputRange: [0.85, 1],
});
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
    const nextHeight = Math.max(
      BASE_INPUT_HEIGHT,
      Math.min(MAX_INPUT_HEIGHT, Math.ceil(event.nativeEvent.contentSize.height)),
    );
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
    setInputHeight(BASE_INPUT_HEIGHT);
    onSend();
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.shell,
        {
          left: layout.horizontalPadding,
          right: layout.horizontalPadding,
        },
        shellStyle,
      ]}
    >
      <BlurView intensity={54} tint="dark" style={StyleSheet.absoluteFill} />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 22,
            borderWidth: 1,
            borderColor: "rgba(167,139,250,0.42)",
            opacity: focusAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 1],
            }),
          },
        ]}
      />
      <Pressable onPress={handleComposerPress} style={styles.chrome}>
        {attachments.length ? (
          <View style={styles.attachmentRail}>
            <View style={styles.attachmentHeader}>
              <Text style={styles.attachmentLabel}>ATTACHMENTS</Text>
              {(["same_item", "separate_items", "reference"] as const).map((role) => (
                <AuraPressable
                  key={role}
                  onPress={() => onAttachmentRoleChange(role)}
                  haptic="selection"
                  hapticTrigger="press"
                  pressedScale={0.96}
                  pressedOpacity={0.88}
                  style={[
                    styles.attachmentRoleChip,
                    attachmentRole === role ? styles.attachmentRoleChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.attachmentRoleText,
                      attachmentRole === role ? styles.attachmentRoleTextActive : null,
                    ]}
                  >
                    {getAttachmentGroupingLabel(role)}
                  </Text>
                </AuraPressable>
              ))}
            </View>
            <View style={styles.attachmentItems}>
              {attachments.map((attachment) => (
                <View key={attachment.id} style={styles.attachmentThumb}>
                  {attachment.type === "image" ? (
                    <Image source={{ uri: attachment.localUri ?? attachment.uri }} style={StyleSheet.absoluteFill} />
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
            </View>
          </View>
        ) : null}

        <Animated.View pointerEvents={menuOpen ? "auto" : "none"} style={[styles.menuTray, menuTrayStyle]}>
          <AttachmentOption
            label="Photo Library"
            icon="images-outline"
            onPress={() => {
              setMenuOpen(false);
              onPickImages();
            }}
            colors={colors}
          />
          <AttachmentOption
            label="Camera"
            icon="camera-outline"
            onPress={() => {
              setMenuOpen(false);
              onTakePhoto();
            }}
            colors={colors}
          />
        </Animated.View>

        <Animated.View style={[styles.row, { minHeight: BASE_COMPOSER_HEIGHT - 8 }]}>
          <View style={styles.iconLane}>
            <AuraPressable
              onPress={() => setMenuOpen((prev) => !prev)}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.94}
              pressedOpacity={0.9}
              style={[
                styles.sideButton,
                menuOpen ? styles.sideButtonActive : null,
              ]}
            >
              <Ionicons name={menuOpen ? "close" : "add"} size={16} color={colors.text} />
            </AuraPressable>
          </View>

          <Animated.View style={[styles.inputSlot, { minHeight: inputHeightAnim }]}>
            {!value ? (
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
              scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
              selectionColor={colors.aiAccent}
              cursorColor={colors.aiAccent}
              maxLength={600}
              style={[
                styles.input,
                {
                  color: colors.text,
                  height: inputHeight,
                },
              ]}
            />
          </Animated.View>

          <View style={styles.iconLane}>
            <AuraPressable
              onPress={canSend ? handleSendPress : onMicPress}
              disabled={loading}
              haptic={canSend ? "light" : "selection"}
              hapticTrigger="press"
              pressedScale={0.94}
              pressedOpacity={0.9}
              style={[
                styles.sideButton,
                styles.trailingButton,
                canSend ? styles.trailingButtonSend : null,
                recording && !canSend ? styles.trailingButtonRecording : null,
                loading ? styles.sideButtonDisabled : null,
              ]}
            >
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
                <Ionicons name="arrow-up" size={16} color="#EAF6FF" />
              </Animated.View>
            </AuraPressable>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
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
    overflow: "hidden",
    borderWidth: 1,
    zIndex: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  chrome: {
    paddingHorizontal: 11,
    paddingTop: 5,
    paddingBottom: 5,
  },
  attachmentRail: {
    gap: 4,
    paddingHorizontal: 1,
    paddingBottom: 3,
  },
  attachmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  attachmentLabel: {
    color: auraTheme.textFaint,
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  attachmentRoleChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  attachmentRoleChipActive: {
    backgroundColor: "rgba(243,190,221,0.14)",
  },
  attachmentRoleText: {
    color: auraTheme.textMuted,
    fontSize: 10,
    fontWeight: "800",
  },
  attachmentRoleTextActive: {
    color: "#F4FBFF",
  },
  attachmentItems: {
    flexDirection: "row",
    gap: 7,
  },
  attachmentThumb: {
    width: 36,
    height: 36,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: auraTheme.surfaceSoft,
    borderWidth: 1,
    borderColor: auraTheme.borderSoft,
  },
  attachmentFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  removeAttachmentButton: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  menuTray: {
    overflow: "hidden",
    paddingHorizontal: 2,
    gap: 3,
  },
  attachmentOption: {
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: auraTheme.borderSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 3,
  },
  attachmentOptionText: {
    color: "#F0F6FB",
    fontSize: 12.5,
    fontWeight: "800",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconLane: {
    width: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  sideButton: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,245,234,0.07)",
  },
  sideButtonActive: {
    backgroundColor: "rgba(243,190,221,0.14)",
    borderColor: "rgba(243,190,221,0.18)",
  },
  trailingButton: {
    position: "relative",
  },
  trailingButtonSend: {
    backgroundColor: "rgba(222,211,248,0.18)",
    borderColor: "rgba(222,211,248,0.28)",
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
    borderRadius: 0,
    backgroundColor: "transparent",
    justifyContent: "center",
    minHeight: 30,
    position: "relative",
  },
  placeholderLayer: {
    position: "absolute",
    left: 4,
    right: 4,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  placeholderText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: INPUT_LINE_HEIGHT,
    includeFontPadding: false,
  },
  input: {
    borderRadius: 0,
    paddingHorizontal: 4,
    paddingTop: Platform.OS === "ios" ? 2 : 1,
    paddingBottom: Platform.OS === "ios" ? 2 : 1,
    marginTop: 0,
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: INPUT_LINE_HEIGHT,
    letterSpacing: 0.1,
    backgroundColor: "transparent",
    includeFontPadding: false,
    textAlignVertical: Platform.OS === "android" ? "center" : "top",
  },
});
