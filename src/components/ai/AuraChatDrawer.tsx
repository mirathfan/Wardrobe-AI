import React from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, type AppColors } from "@/constants/theme";
import type { AIChatThread } from "@/src/lib/aiChats";

import { auraTheme } from "./aiTheme";

type Section = {
  title: string;
  items: AIChatThread[];
};

export default function AuraChatDrawer({
  visible,
  colors,
  activeChatId,
  threads,
  onClose,
  onSelectChat,
}: {
  visible: boolean;
  colors: AppColors;
  activeChatId: string | null;
  threads: AIChatThread[];
  onClose: () => void;
  onSelectChat: (thread: AIChatThread) => void;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = React.useState(visible);
  const [query, setQuery] = React.useState("");
  const drawerWidth = 320;
  const translateX = React.useRef(new Animated.Value(-drawerWidth)).current;

  const filteredThreads = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return threads;
    return threads.filter((thread) => {
      const haystack = `${thread.title} ${thread.lastMessagePreview}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, threads]);

  const sections = React.useMemo(() => buildSections(filteredThreads), [filteredThreads]);

  const overlayOpacity = translateX.interpolate({
    inputRange: [-drawerWidth, 0],
    outputRange: [0, 0.45],
    extrapolate: "clamp",
  });

  const closeDrawer = React.useCallback(() => {
    Animated.timing(translateX, {
      toValue: -drawerWidth,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        onClose();
      }
    });
  }, [drawerWidth, onClose, translateX]);

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    if (mounted) {
      closeDrawer();
    }
  }, [closeDrawer, mounted, translateX, visible]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && gestureState.dx < -6,
        onPanResponderMove: (_, gestureState) => {
          translateX.setValue(Math.max(-drawerWidth, Math.min(0, gestureState.dx)));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -drawerWidth * 0.18 || gestureState.vx < -0.65) {
            closeDrawer();
            return;
          }
          Animated.timing(translateX, {
            toValue: 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.timing(translateX, {
            toValue: 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        },
      }),
    [closeDrawer, drawerWidth, translateX],
  );

  if (!mounted) return null;

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={closeDrawer}>
      <View style={styles.root}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
        </Animated.View>

        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              paddingTop: insets.top + 10,
              paddingBottom: Math.max(insets.bottom + 16, 24),
              transform: [{ translateX }],
            },
          ]}
        >
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.drawerOverlay} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text, letterSpacing: -0.5 }]}>Chats</Text>
          </View>

          <View style={styles.searchShell}>
            <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats"
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.text }]}
              selectionColor={colors.aiAccent}
              cursorColor={colors.aiAccent}
            />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.items.map((thread) => {
                  const isActive = thread.chatId === activeChatId;
                  return (
                    <Pressable
                      key={thread.chatId}
                      onPress={() => {
                        onSelectChat(thread);
                        closeDrawer();
                      }}
                      style={({ pressed }) => [
                        styles.chatRow,
                        isActive ? styles.chatRowActive : null,
                        pressed ? styles.chatRowPressed : null,
                      ]}
                    >
                      <View style={styles.chatBody}>
                        <Text style={[styles.chatTitle, { color: colors.text }]} numberOfLines={1}>
                          {thread.title || "AURA chat"}
                        </Text>
                        <Text style={styles.chatPreview} numberOfLines={1}>
                          {thread.lastMessagePreview || "New stylist chat"}
                        </Text>
                      </View>
                      <Text style={styles.chatTime}>{formatTimestamp(thread.updatedAt)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            {!sections.length ? (
              <Text style={styles.emptyText}>No chats yet.</Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function buildSections(threads: AIChatThread[]): Section[] {
  const today: AIChatThread[] = [];
  const yesterday: AIChatThread[] = [];
  const previous: AIChatThread[] = [];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;

  threads.forEach((thread) => {
    if (thread.updatedAt >= startOfToday) {
      today.push(thread);
      return;
    }
    if (thread.updatedAt >= startOfYesterday) {
      yesterday.push(thread);
      return;
    }
    previous.push(thread);
  });

  return [
    { title: "Today", items: today },
    { title: "Yesterday", items: yesterday },
    { title: "Previous", items: previous },
  ].filter((section) => section.items.length);
}

function formatTimestamp(value: number) {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-start",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  drawer: {
    flex: 1,
    backgroundColor: "rgba(10,16,24,0.92)",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.06)",
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7,12,19,0.78)",
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 27,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  searchShell: {
    marginHorizontal: 18,
    marginBottom: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.03)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    lineHeight: 18,
    paddingVertical: 0,
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    paddingHorizontal: 6,
    color: auraTheme.textFaint,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  chatRow: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  chatRowActive: {
    backgroundColor: "rgba(143,216,255,0.12)",
  },
  chatRowPressed: {
    opacity: 0.82,
  },
  chatBody: {
    flex: 1,
    gap: 3,
  },
  chatTitle: {
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  chatPreview: {
    color: auraTheme.textMuted,
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 16,
  },
  chatTime: {
    minWidth: 52,
    textAlign: "right",
    color: auraTheme.textFaint,
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  emptyText: {
    paddingHorizontal: 8,
    color: auraTheme.textMuted,
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 18,
  },
});
