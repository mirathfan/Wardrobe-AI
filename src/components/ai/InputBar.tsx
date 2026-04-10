import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React from "react";
import {
  Animated,
  Easing,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TextInputContentSizeChangeEventData,
  View,
} from "react-native";

import { Fonts, type AppColors } from "@/constants/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

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
  onPlusPress,
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
  onPlusPress: () => void;
}) {
  const layout = useResponsiveLayout();
  const canSend = value.trim().length > 0 && !loading;
  const focusAnim = React.useRef(new Animated.Value(active ? 1 : 0)).current;
  const bottomAnim = React.useRef(new Animated.Value(bottom)).current;
  const heightAnim = React.useRef(new Animated.Value(20)).current;
  const [contentHeight, setContentHeight] = React.useState(20);
  const minComposerHeight = layout.screenSize === "compact" ? 56 : 58;
  const maxComposerHeight = layout.screenSize === "compact" ? 132 : 140;
  const maxTextHeight = layout.screenSize === "compact" ? 82 : 92;
  const clampedContentHeight = Math.max(20, Math.min(contentHeight, maxTextHeight));
  const shouldScrollInput = contentHeight > maxTextHeight;

  React.useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: active ? 1 : 0,
      duration: 260,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [active, focusAnim]);

  React.useEffect(() => {
    Animated.timing(bottomAnim, {
      toValue: bottom,
      duration: Platform.OS === "ios" ? 260 : 180,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [bottom, bottomAnim]);

  React.useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: clampedContentHeight,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clampedContentHeight, heightAnim]);

  const estimatedComposerHeight = Math.max(
    minComposerHeight,
    Math.min(maxComposerHeight, clampedContentHeight + 18)
  );

  React.useEffect(() => {
    onHeightChange?.(estimatedComposerHeight);
  }, [estimatedComposerHeight, onHeightChange]);

  const shellStyle = {
    bottom: bottomAnim,
    borderRadius: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [layout.largeRadius + 6, layout.largeRadius + 1],
    }),
    borderColor: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(255,255,255,0.07)", "rgba(143,216,255,0.18)"],
    }),
    backgroundColor: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(20,24,30,0.82)", "rgba(17,21,28,0.9)"],
    }),
    shadowOpacity: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.24, 0.18],
    }),
    shadowRadius: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [22, 14],
    }),
    transform: [
      {
        translateY: focusAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -1],
        }),
      },
    ],
  } as const;

  const chromeStyle = {
    paddingHorizontal: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [8, 7],
    }),
    paddingTop: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [4, 3],
    }),
    paddingBottom: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [4, 3],
    }),
  } as const;

  const plusWrapStyle = {
    width: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [30, 29],
    }),
    height: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [30, 29],
    }),
    opacity: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.96],
    }),
    marginRight: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
  } as const;

  const inputLaneStyle = {
    minHeight: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [36, 35],
    }),
    borderRadius: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [layout.pillRadius, layout.pillRadius - 2],
    }),
    paddingHorizontal: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [12, 11],
    }),
    paddingTop: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [7, 6],
    }),
    paddingBottom: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [7, 6],
    }),
    backgroundColor: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(255,255,255,0.028)", "rgba(255,255,255,0.018)"],
    }),
  } as const;

  const sendWrapStyle = {
    width: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [31, 30],
    }),
    height: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [31, 30],
    }),
    marginLeft: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
    marginBottom: focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
  } as const;

  function handleContentSizeChange(
    event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>
  ) {
    const nextHeight = event.nativeEvent.contentSize.height;
    if (Math.abs(nextHeight - contentHeight) > 1) {
      setContentHeight(nextHeight);
    }
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          left: layout.horizontalPadding,
          right: layout.horizontalPadding,
          overflow: "hidden",
          borderWidth: 1,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          elevation: 18,
        },
        shellStyle,
      ]}
    >
      <BlurView intensity={52} tint="dark" style={StyleSheet.absoluteFill} />
      <Animated.View style={chromeStyle}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Animated.View style={plusWrapStyle}>
            <Pressable
              onPress={onPlusPress}
              hitSlop={6}
              style={{
                flex: 1,
                borderRadius: layout.pillRadius,
                backgroundColor: "rgba(255,255,255,0.03)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="add" size={17} color={colors.text} />
            </Pressable>
          </Animated.View>

          <Animated.View
            style={[
              {
                flex: 1,
                justifyContent: "center",
              },
              inputLaneStyle,
            ]}
          >
            <TextInput
              value={value}
              onChangeText={onChangeText}
              onFocus={() => onFocusChange(true)}
              onBlur={() => onFocusChange(false)}
              onContentSizeChange={handleContentSizeChange}
              onSubmitEditing={() => {
                if (canSend) onSend();
              }}
              placeholder={placeholder}
              placeholderTextColor={colors.textSecondary}
              multiline
              blurOnSubmit={false}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              returnKeyType="send"
              keyboardAppearance="dark"
              scrollEnabled={shouldScrollInput}
              selectionColor={colors.aiAccent}
              cursorColor={colors.aiAccent}
              maxLength={600}
              style={{
                color: colors.text,
                fontFamily: Fonts.sans,
                fontSize: 15,
                lineHeight: 19,
                minHeight: 20,
                maxHeight: maxTextHeight,
                height: clampedContentHeight,
                paddingTop: 0,
                paddingBottom: 0,
                paddingVertical: 0,
                includeFontPadding: false,
                textAlignVertical: clampedContentHeight > 24 ? "top" : "center",
              }}
            />
          </Animated.View>

          <Animated.View style={sendWrapStyle}>
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              hitSlop={6}
              style={{
                flex: 1,
                borderRadius: layout.pillRadius,
                backgroundColor: canSend ? colors.aiAccent : "rgba(255,255,255,0.07)",
                alignItems: "center",
                justifyContent: "center",
                opacity: canSend ? 1 : 0.65,
                shadowColor: canSend ? colors.aiAccent : "#000",
                shadowOpacity: canSend ? 0.22 : 0,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
              }}
            >
              <Ionicons name="arrow-up" size={15} color={canSend ? "#081019" : colors.textSecondary} />
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
