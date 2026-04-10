import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DOCK_HEIGHT,
  DOCK_ITEM_COUNT,
  DOCK_RADIUS,
  DOCK_SIDE_MARGIN,
} from '../constants/dock';
import { useAppTheme } from '../hooks/useAppTheme';

const TAB_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  index: { label: 'Home', icon: 'home-outline' },
  closet: { label: 'Closet', icon: 'shirt-outline' },
  ai: { label: 'AI', icon: 'sparkles-outline' },
  calendar: { label: 'Calendar', icon: 'calendar-outline' },
  profile: { label: 'Profile', icon: 'person-circle-outline' },
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
  const dockBottom = Math.max(16, insets.bottom * 0.35);

  const visibleRoutes = useMemo(
    () =>
      state.routes.filter((route) => {
        const options = descriptors[route.key]?.options;
        if (options?.href === null) return false;
        return !!TAB_META[route.name];
      }),
    [descriptors, state.routes]
  );

  const currentKey = state.routes[state.index]?.key;
  const focusedVisibleIndex = Math.max(
    0,
    visibleRoutes.findIndex((route) => route.key === currentKey)
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
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={onPress}
                onLongPress={onLongPress}
                style={styles.item}
              >
                <Ionicons name={iconName} size={route.name === 'ai' ? 24 : 22} color={color} />
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
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
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
    gap: 2,
  },
  label: {
    fontSize: 11,
  },
});
