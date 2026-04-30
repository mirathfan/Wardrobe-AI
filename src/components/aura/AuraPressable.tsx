import React from "react";
import {
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useReduceMotion } from "@/hooks/useReduceMotion";
import { runHaptic, type AuraHapticType } from "@/src/lib/haptics";

type HapticTrigger = "pressIn" | "press" | "longPress";

type AuraPressableProps = Omit<PressableProps, "children" | "style"> & {
  children?: React.ReactNode | ((state: PressableStateCallbackType) => React.ReactNode);
  style?:
    | StyleProp<ViewStyle>
    | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  containerStyle?: StyleProp<ViewStyle>;
  pressedScale?: number;
  pressedOpacity?: number;
  haptic?: AuraHapticType;
  hapticTrigger?: HapticTrigger;
};

function resolveStyle(
  style:
    | StyleProp<ViewStyle>
    | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>)
    | undefined,
  state: PressableStateCallbackType,
) {
  return typeof style === "function" ? style(state) : style;
}

export default function AuraPressable({
  children,
  style,
  containerStyle,
  pressedScale = 0.97,
  pressedOpacity,
  haptic,
  hapticTrigger = "pressIn",
  disabled,
  onPressIn,
  onPressOut,
  onPress,
  onLongPress,
  ...rest
}: AuraPressableProps) {
  const reduceMotion = useReduceMotion();
  const pressedProgress = useSharedValue(0);
  const [pressed, setPressed] = React.useState(false);
  const hapticFiredRef = React.useRef(false);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = reduceMotion
      ? 1
      : interpolate(pressedProgress.value, [0, 1], [1, pressedScale]);
    const opacity =
      pressedOpacity == null
        ? 1
        : interpolate(pressedProgress.value, [0, 1], [1, pressedOpacity]);
    return {
      transform: [{ scale }],
      opacity,
    };
  }, [pressedOpacity, pressedScale, reduceMotion]);

  const fireHaptic = React.useCallback(
    (trigger: HapticTrigger) => {
      if (!haptic || disabled || hapticTrigger !== trigger) return;
      if (trigger === "pressIn" && hapticFiredRef.current) return;
      hapticFiredRef.current = true;
      void runHaptic(haptic);
    },
    [disabled, haptic, hapticTrigger],
  );

  const handlePressIn = React.useCallback(
    (event: Parameters<NonNullable<PressableProps["onPressIn"]>>[0]) => {
      setPressed(true);
      pressedProgress.value = withTiming(1, { duration: reduceMotion ? 0 : 100 });
      fireHaptic("pressIn");
      onPressIn?.(event);
    },
    [fireHaptic, onPressIn, pressedProgress, reduceMotion],
  );

  const handlePressOut = React.useCallback(
    (event: Parameters<NonNullable<PressableProps["onPressOut"]>>[0]) => {
      setPressed(false);
      pressedProgress.value = withTiming(0, { duration: reduceMotion ? 0 : 120 });
      hapticFiredRef.current = false;
      onPressOut?.(event);
    },
    [onPressOut, pressedProgress, reduceMotion],
  );

  const handlePress = React.useCallback(
    (event: Parameters<NonNullable<PressableProps["onPress"]>>[0]) => {
      fireHaptic("press");
      onPress?.(event);
    },
    [fireHaptic, onPress],
  );

  const handleLongPress = React.useCallback(
    (event: Parameters<NonNullable<PressableProps["onLongPress"]>>[0]) => {
      fireHaptic("longPress");
      onLongPress?.(event);
    },
    [fireHaptic, onLongPress],
  );

  const state = React.useMemo<PressableStateCallbackType>(
    () => ({ pressed, hovered: false }),
    [pressed],
  );

  return (
    <Animated.View style={[containerStyle, animatedStyle]}>
      <Pressable
        {...rest}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        onLongPress={handleLongPress}
        style={resolveStyle(style, state)}
      >
        {typeof children === "function" ? children(state) : children}
      </Pressable>
    </Animated.View>
  );
}
