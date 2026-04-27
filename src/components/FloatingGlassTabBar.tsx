import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DOCK_HEIGHT,
  DOCK_ITEM_COUNT,
  DOCK_RADIUS,
  DOCK_SIDE_MARGIN,
  floatingTabBarBottomInset,
} from '../constants/dock';
import { useAppTheme } from '../hooks/useAppTheme';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const TAB_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  index: { label: 'Home', icon: 'home-outline' },
  closet: { label: 'Closet', icon: 'shirt-outline' },
  ai: { label: 'AI', icon: 'sparkles-outline' },
  calendar: { label: 'Calendar', icon: 'calendar-outline' },
  profile: { label: 'Profile', icon: 'person-circle-outline' },
};

type ExpoRouterTabOptions = {
  href?: string | null;
};

function getFocusedIcon(name: keyof typeof Ionicons.glyphMap) {
  if (name === 'home-outline') return 'home';
  if (name === 'calendar-outline') return 'calendar';
  if (name === 'sparkles-outline') return 'sparkles';
  if (name === 'shirt-outline') return 'shirt';
  if (name === 'person-circle-outline') return 'person-circle';
  return name;
}

export default function FloatingGlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [dockWidth, setDockWidth] = useState(0);
  const bubbleX = useRef(new Animated.Value(0)).current;
  const dockBottom = floatingTabBarBottomInset(insets.bottom);

  const visibleRoutes = useMemo(
    () =>
      state.routes.filter((route) => {
        const options = descriptors[route.key]?.options as ExpoRouterTabOptions | undefined;
        if (options?.href === null) return false;
        return !!TAB_META[route.name];
      }),
    [descriptors, state.routes]
  );

  const currentKey = state.routes[state.index]?.key;
  const currentRoute = state.routes[state.index];
  const hiddenRouteSourceTab =
    (currentRoute?.params as { sourceTab?: string } | undefined)?.sourceTab ?? null;
  const focusedVisibleIndex = Math.max(
    0,
    visibleRoutes.findIndex(
      (route) => route.key === currentKey || route.name === hiddenRouteSourceTab
    )
  );

  const segmentWidth = dockWidth > 0 ? dockWidth / DOCK_ITEM_COUNT : 0;
  const bubbleWidth = Math.max(0, segmentWidth - 10);

  useEffect(() => {
    if (segmentWidth <= 0) return;
    const target = focusedVisibleIndex * segmentWidth + 5;
    Animated.spring(bubbleX, {
      toValue: target,
      useNativeDriver: true,
      damping: 20,
      mass: 0.7,
      stiffness: 220,
    }).start();
  }, [bubbleX, focusedVisibleIndex, segmentWidth]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
      <LinearGradient
        pointerEvents="none"
        colors={[colors.scrimTop, colors.scrimMid, colors.scrimBottom]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.scrim, { bottom: dockBottom }]}
      />
      <View
        style={[styles.container, { bottom: dockBottom }]}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          if (Math.abs(width - dockWidth) > 1) {
            setDockWidth(width);
          }
        }}
      >
        <BlurView intensity={70} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]} />
        <View style={[styles.glassBorder, { borderColor: colors.glassBorder }]} />
        <View style={[styles.innerBorder, { borderColor: colors.glassInnerBorder }]} />
        <View style={[styles.glassEdge, { backgroundColor: colors.glassEdge }]} />

        {bubbleWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.activeLens,
              {
                width: bubbleWidth,
                backgroundColor: colors.lens,
                transform: [{ translateX: bubbleX }],
              },
            ]}
          >
            <View style={[styles.activeLensInner, { backgroundColor: colors.lensInner }]} />
          </Animated.View>
        ) : null}

        <View style={styles.row}>
          {visibleRoutes.map((route, index) => {
            const isFocused = index === focusedVisibleIndex;
            const meta = TAB_META[route.name] ?? {
              label: route.name,
              icon: 'ellipse-outline' as const,
            };
            const activeColor = route.name === 'ai' ? colors.aiAccent : colors.accent;
            const color = isFocused ? activeColor : colors.dockIcon;
            const iconName = isFocused ? getFocusedIcon(meta.icon) : meta.icon;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <TabBarItem
                key={route.key}
                isFocused={isFocused}
                iconName={iconName}
                iconSize={route.name === 'ai' ? 24 : 22}
                label={meta.label}
                color={color}
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

function TabBarItem({
  isFocused,
  iconName,
  iconSize,
  label,
  color,
  onPress,
  onLongPress,
}: {
  isFocused: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  iconSize: number;
  label: string;
  color: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const dotOpacity = useSharedValue(isFocused ? 1 : 0);
  const dotScale = useSharedValue(isFocused ? 1 : 0);
  const iconScale = useSharedValue(isFocused ? 1.12 : 1);

  useEffect(() => {
    if (reduceMotion) {
      dotOpacity.value = isFocused ? 1 : 0;
      dotScale.value = isFocused ? 1 : 0;
      iconScale.value = isFocused ? 1.12 : 1;
      return;
    }
    dotOpacity.value = withTiming(isFocused ? 1 : 0, {
      duration: isFocused ? 200 : 150,
    });
    dotScale.value = isFocused
      ? withSpring(1, { damping: 10 })
      : withTiming(0, { duration: 150 });
    iconScale.value = isFocused
      ? withSpring(1.12, { damping: 10 })
      : withTiming(1, { duration: 150 });
  }, [dotOpacity, dotScale, iconScale, isFocused, reduceMotion]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
    transform: [{ scale: dotScale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.item}
    >
      <Reanimated.View style={iconStyle}>
        <Ionicons name={iconName} size={iconSize} color={color} />
      </Reanimated.View>
      <Reanimated.View
        pointerEvents="none"
        style={[
          styles.activeDot,
          { backgroundColor: colors.iridescentStart },
          dotStyle,
        ]}
      />
      <Text
        style={[
          styles.label,
          {
            color,
            opacity: isFocused ? 1 : 0.55,
            fontWeight: isFocused ? '600' : '500',
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: DOCK_HEIGHT,
  },
  container: {
    position: 'absolute',
    left: DOCK_SIDE_MARGIN,
    right: DOCK_SIDE_MARGIN,
    height: DOCK_HEIGHT,
    borderRadius: 34,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: DOCK_RADIUS,
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    margin: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 25,
  },
  glassEdge: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: 1,
  },
  activeLens: {
    position: 'absolute',
    top: 7,
    height: DOCK_HEIGHT - 14,
    borderRadius: 22,
    overflow: 'hidden',
  },
  activeLensInner: {
    ...StyleSheet.absoluteFillObject,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  label: {
    fontSize: 11,
  },
});
