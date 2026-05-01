import React from "react";
import {
  ActivityIndicator,
  Alert,
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
  useWindowDimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, type AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { summarizeThreadDisplayTitle, type AIChatThread } from "@/src/lib/aiChats";

import { auraTheme } from "./aiTheme";

type Section = {
  title: string;
  items: AIChatThread[];
};

type MenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DrawerActionHandlers = {
  onShareChat: (thread: AIChatThread) => Promise<void> | void;
  onAddToProject: (thread: AIChatThread) => Promise<void> | void;
  onTogglePin: (thread: AIChatThread) => Promise<void> | void;
  onRenameChat: (thread: AIChatThread, title: string) => Promise<void> | void;
  onArchiveChat: (thread: AIChatThread) => Promise<void> | void;
  onDeleteChat: (thread: AIChatThread) => Promise<void> | void;
};

export default function AuraChatDrawer({
  visible,
  colors,
  activeChatId,
  threads,
  onClose,
  onSelectChat,
  onShareChat,
  onAddToProject,
  onTogglePin,
  onRenameChat,
  onArchiveChat,
  onDeleteChat,
}: {
  visible: boolean;
  colors: AppColors;
  activeChatId: string | null;
  threads: AIChatThread[];
  onClose: () => void;
  onSelectChat: (thread: AIChatThread) => void;
} & DrawerActionHandlers) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [mounted, setMounted] = React.useState(visible);
  const [query, setQuery] = React.useState("");
  const [menuThread, setMenuThread] = React.useState<AIChatThread | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<MenuAnchor | null>(null);
  const [renameVisible, setRenameVisible] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const drawerWidth = 320;
  const menuWidth = Math.min(drawerWidth - 32, 292);
  const menuHeightEstimate = 360;
  const translateX = React.useRef(new Animated.Value(-drawerWidth)).current;
  const rowRefs = React.useRef<Record<string, View | null>>({});

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
    setMenuThread(null);
    setMenuAnchor(null);
    setRenameVisible(false);
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

  React.useEffect(() => {
    if (!menuThread) return;
    const nextThread = threads.find((thread) => thread.chatId === menuThread.chatId) ?? null;
    setMenuThread(nextThread);
  }, [menuThread, threads]);

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

  const closeContextMenu = React.useCallback(() => {
    if (busyAction) return;
    setMenuThread(null);
    setMenuAnchor(null);
  }, [busyAction]);

  const openRename = React.useCallback((thread: AIChatThread) => {
    setRenameValue(summarizeThreadDisplayTitle(thread));
    setRenameVisible(true);
  }, []);

  const openContextMenuForThread = React.useCallback(
    (thread: AIChatThread) => {
      const row = rowRefs.current[thread.chatId];
      if (!row?.measureInWindow) {
        setMenuAnchor(null);
        setMenuThread(thread);
        return;
      }
      row.measureInWindow((x, y, width, height) => {
        if ([x, y, width, height].every((value) => Number.isFinite(value)) && width > 0 && height > 0) {
          setMenuAnchor({ x, y, width, height });
        } else {
          setMenuAnchor(null);
        }
        setMenuThread(thread);
      });
    },
    [],
  );

  const runMenuAction = React.useCallback(
    async (key: string, action: () => Promise<void> | void, options?: { closeMenu?: boolean }) => {
      try {
        setBusyAction(key);
        await action();
        if (options?.closeMenu !== false) {
          setMenuThread(null);
          setMenuAnchor(null);
        }
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  const menuPosition = React.useMemo(() => {
    if (!menuAnchor) return null;
    const top = clamp(
      menuAnchor.y + menuAnchor.height * 0.2,
      Math.max(insets.top + 12, 80),
      Math.max(insets.top + 12, screenHeight - menuHeightEstimate - Math.max(insets.bottom, 24)),
    );
    const left = clamp(
      menuAnchor.x + 24,
      16,
      Math.max(16, screenWidth - menuWidth - 16),
    );
    return { top, left };
  }, [insets.bottom, insets.top, menuAnchor, menuHeightEstimate, menuWidth, screenHeight, screenWidth]);

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
            <Text style={[styles.title, { color: colors.text, letterSpacing: 0 }]}>Chats</Text>
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
                <Text style={[styles.sectionTitle, { color: colors.softPurple }]}>{section.title}</Text>
                {section.items.map((thread) => {
                  const isActive = thread.chatId === activeChatId;
                  const isSelected = menuThread?.chatId === thread.chatId;
                  const displayTitle = summarizeThreadDisplayTitle(thread);
                  return (
                    <View
                      key={thread.chatId}
                      ref={(node) => {
                        rowRefs.current[thread.chatId] = node;
                      }}
                      collapsable={false}
                    >
                      <AuraPressable
                        onLongPress={() => openContextMenuForThread(thread)}
                        delayLongPress={220}
                        haptic="selection"
                        hapticTrigger="longPress"
                        pressedScale={0.985}
                        pressedOpacity={0.9}
                        onPress={() => {
                          onSelectChat(thread);
                          closeDrawer();
                        }}
                        style={[
                          styles.chatRow,
                          {
                            backgroundColor: isSelected
                              ? colors.purpleSurfaceStrong
                              : isActive
                                ? colors.purpleSurface
                                : "transparent",
                            borderColor: isSelected || isActive ? colors.purpleBorder : "transparent",
                          },
                        ]}
                      >
                        <View style={styles.chatBody}>
                          <View style={styles.titleRow}>
                            <Text style={[styles.chatTitle, { color: colors.text }]} numberOfLines={1}>
                              {displayTitle || "AURA chat"}
                            </Text>
                            {thread.pinned ? (
                              <View
                                style={[
                                  styles.pinBadge,
                                  {
                                    backgroundColor: colors.purpleSurface,
                                    borderColor: colors.purpleBorder,
                                  },
                                ]}
                              >
                                <Ionicons name="pin" size={10} color={colors.lightPurple} />
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.chatPreview} numberOfLines={1}>
                            {thread.lastMessagePreview || "New stylist chat"}
                          </Text>
                        </View>
                        <View style={styles.metaColumn}>
                          <Text style={styles.chatTime}>{formatTimestamp(thread.updatedAt)}</Text>
                        </View>
                      </AuraPressable>
                    </View>
                  );
                })}
              </View>
            ))}
            {!sections.length ? <Text style={styles.emptyText}>No chats yet.</Text> : null}
          </ScrollView>
        </Animated.View>

        {menuThread ? (
          <View style={styles.menuOverlay} pointerEvents="box-none">
            <Pressable style={StyleSheet.absoluteFill} onPress={closeContextMenu} />
            <View
              style={[
                styles.menuShell,
                menuPosition
                  ? {
                      width: menuWidth,
                      top: menuPosition.top,
                      left: menuPosition.left,
                    }
                  : {
                      width: menuWidth,
                      alignSelf: "center",
                      marginTop: Math.max(insets.top + 72, 120),
                    },
              ]}
            >
              <BlurView intensity={58} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.menuBackdrop} />
              <View style={styles.menuHeader}>
                <Text style={[styles.menuTitle, { color: colors.text }]} numberOfLines={1}>
                  {summarizeThreadDisplayTitle(menuThread)}
                </Text>
                <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {menuThread.lastMessagePreview || "AURA chat"}
                </Text>
              </View>

              <MenuActionRow
                icon="share-outline"
                label="Share chat"
                colors={colors}
                busy={busyAction === "share"}
                onPress={() => void runMenuAction("share", () => onShareChat(menuThread))}
              />
              <MenuActionRow
                icon="folder-open-outline"
                label="Add to project"
                suffix=">"
                colors={colors}
                busy={busyAction === "project"}
                onPress={() => void runMenuAction("project", () => onAddToProject(menuThread))}
              />
              <MenuActionRow
                icon={menuThread.pinned ? "pin-outline" : "pin"}
                label={menuThread.pinned ? "Unpin" : "Pin"}
                colors={colors}
                busy={busyAction === "pin"}
                onPress={() => void runMenuAction("pin", () => onTogglePin(menuThread))}
              />
              <MenuActionRow
                icon="create-outline"
                label="Rename"
                colors={colors}
                onPress={() => openRename(menuThread)}
              />
              <MenuActionRow
                icon="archive-outline"
                label="Archive"
                colors={colors}
                busy={busyAction === "archive"}
                onPress={() => void runMenuAction("archive", () => onArchiveChat(menuThread))}
              />
              <MenuActionRow
                icon="trash-outline"
                label="Delete"
                danger
                colors={colors}
                busy={busyAction === "delete"}
                onPress={() =>
                  Alert.alert(
                    "Delete chat?",
                    "This removes the chat and its saved message history from AURA.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                          void runMenuAction("delete", () => onDeleteChat(menuThread));
                        },
                      },
                    ],
                  )
                }
              />
            </View>
          </View>
        ) : null}

        <Modal
          transparent
          visible={renameVisible}
          animationType="fade"
          onRequestClose={() => setRenameVisible(false)}
        >
          <View style={styles.renameRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setRenameVisible(false)} />
            <View style={[styles.renameCard, { marginTop: insets.top + 96 }]}>
              <BlurView intensity={58} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.menuBackdrop} />
              <Text style={[styles.renameTitle, { color: colors.text }]}>Rename chat</Text>
              <TextInput
                value={renameValue}
                onChangeText={setRenameValue}
                autoFocus
                maxLength={80}
                placeholder="AURA chat"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.renameInput,
                  {
                    color: colors.text,
                    borderColor: colors.borderStrong,
                    backgroundColor: colors.surfaceElevated,
                  },
                ]}
                selectionColor={colors.aiAccent}
                cursorColor={colors.aiAccent}
              />
              <View style={styles.renameActions}>
                <Pressable
                  onPress={() => setRenameVisible(false)}
                  style={({ pressed }) => [
                    styles.renameButton,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.borderStrong,
                    },
                    pressed ? styles.chatRowPressed : null,
                  ]}
                >
                  <Text style={[styles.renameButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!menuThread) return;
                    const nextTitle = renameValue.trim();
                    if (!nextTitle) {
                      Alert.alert("Rename chat", "Give this chat a title first.");
                      return;
                    }
                    void runMenuAction(
                      "rename",
                      async () => {
                        await onRenameChat(menuThread, nextTitle);
                        setRenameVisible(false);
                      },
                      { closeMenu: false },
                    );
                  }}
                  style={({ pressed }) => [
                    styles.renameButton,
                    {
                      backgroundColor: colors.purpleSurface,
                      borderColor: colors.purpleBorder,
                    },
                    pressed ? styles.chatRowPressed : null,
                  ]}
                >
                  <Text style={[styles.renameButtonText, { color: colors.text }]}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

function buildSections(threads: AIChatThread[]): Section[] {
  const pinned = threads.filter((thread) => thread.pinned);
  const today: AIChatThread[] = [];
  const yesterday: AIChatThread[] = [];
  const previous: AIChatThread[] = [];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;

  threads
    .filter((thread) => !thread.pinned)
    .forEach((thread) => {
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
    { title: "Pinned", items: pinned },
    { title: "Today", items: today },
    { title: "Yesterday", items: yesterday },
    { title: "Previous", items: previous },
  ].filter((section) => section.items.length);
}

function MenuActionRow({
  icon,
  label,
  colors,
  onPress,
  danger,
  suffix,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  colors: AppColors;
  onPress: () => void;
  danger?: boolean;
  suffix?: string;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      style={({ pressed }) => [
        styles.menuRow,
        {
          backgroundColor: pressed ? colors.surfaceElevated : "transparent",
        },
      ]}
    >
      <View style={styles.menuRowLeading}>
        {busy ? (
          <ActivityIndicator size="small" color={danger ? colors.danger : colors.textSecondary} />
        ) : (
          <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.textSecondary} />
        )}
        <Text style={[styles.menuRowText, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
      </View>
      {suffix ? <Text style={[styles.menuRowSuffix, { color: colors.textSecondary }]}>{suffix}</Text> : null}
    </Pressable>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
    backgroundColor: auraTheme.surface,
    borderRightWidth: 1,
    borderRightColor: auraTheme.borderSoft,
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,10,15,0.82)",
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
    letterSpacing: 0,
  },
  searchShell: {
    marginHorizontal: 18,
    marginBottom: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: auraTheme.borderSoft,
    backgroundColor: auraTheme.surfaceSoft,
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
    borderWidth: 1,
  },
  chatRowPressed: {
    opacity: 0.82,
  },
  chatBody: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaColumn: {
    alignItems: "flex-end",
  },
  pinBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chatTitle: {
    flex: 1,
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
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 16,
  },
  menuShell: {
    position: "absolute",
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: auraTheme.border,
    backgroundColor: auraTheme.surface,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(9,10,15,0.78)",
  },
  menuHeader: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: auraTheme.borderSoft,
  },
  menuTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
  },
  menuSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "500",
  },
  menuRow: {
    minHeight: 48,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuRowLeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuRowText: {
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  menuRowSuffix: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  renameRoot: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  renameCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: auraTheme.border,
    backgroundColor: auraTheme.surface,
    padding: 18,
    gap: 14,
  },
  renameTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
  },
  renameInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.sans,
    fontSize: 14.5,
    lineHeight: 18,
  },
  renameActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  renameButton: {
    minWidth: 86,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  renameButtonText: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
  },
});
