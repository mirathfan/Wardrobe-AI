import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { Colors } from "@/constants/theme";
import { SafeScreen } from "@/src/components/SafeScreen";
import { LookDetailModal } from "@/src/components/profile/LookDetailModal";
import { MyLookSkeleton, MyLookThumbnail } from "@/src/components/profile/MyLookThumbnail";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import {
  dislikeProfileLooks,
  favouriteProfileLooks,
  likeProfileLooks,
  removeProfileLooks,
  subscribeFavouriteLooks,
  subscribeProfileFeedbackLooks,
  type ProfileLookRecord,
} from "@/src/lib/profileLooks";

type TabKey = "liked" | "disliked" | "favourites";

const TABS: { key: TabKey; label: string }[] = [
  { key: "liked", label: "Liked" },
  { key: "disliked", label: "Disliked" },
  { key: "favourites", label: "Favourites" },
];
const palette = Colors.dark;

function normalizeInitialTab(value: unknown): TabKey {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "disliked") return "disliked";
  if (raw === "favourites" || raw === "favorites") return "favourites";
  return "liked";
}

function selectionKey(record: ProfileLookRecord) {
  return `${record.collection}:${record.id}`;
}

function buildShareMessage(records: ProfileLookRecord[]) {
  if (records.length === 1) {
    const record = records[0];
    return [
      record.title || "AURA look",
      ...record.look.pieces.map((piece) => `• ${piece.itemName}`),
    ].join("\n");
  }

  return records
    .map((record, index) => {
      const pieces = record.look.pieces.map((piece) => piece.itemName).filter(Boolean).join(", ");
      return `${index + 1}. ${record.title || "AURA look"}${pieces ? `: ${pieces}` : ""}`;
    })
    .join("\n");
}

function EmptyState({ tab }: { tab: TabKey }) {
  const content = {
    liked: {
      icon: "♥",
      title: "No liked outfits yet",
      subtext: "Like outfits in AURA chat to save them here",
      button: "Ask AURA for outfits →",
      onPress: () => router.push("/(tabs)/ai"),
    },
    disliked: {
      icon: "✗",
      title: "No disliked outfits",
      subtext: "AURA learns from what you don't like too",
      button: "",
      onPress: undefined,
    },
    favourites: {
      icon: "★",
      title: "No favourites yet",
      subtext: "Save looks from AURA chat or swipe up in training mode",
      button: "Train AURA →",
      onPress: () => router.push("/aura/swipe"),
    },
  }[tab];

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{content.icon}</Text>
      <Text style={styles.emptyTitle}>{content.title}</Text>
      <Text style={styles.emptySubtext}>{content.subtext}</Text>
      {content.button && content.onPress ? (
        <Pressable onPress={content.onPress} style={styles.emptyButton}>
          <Text style={styles.emptyButtonText}>{content.button}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function MyLooksScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>(() => normalizeInitialTab(params.tab));
  const [liked, setLiked] = useState<ProfileLookRecord[]>([]);
  const [disliked, setDisliked] = useState<ProfileLookRecord[]>([]);
  const [favourites, setFavourites] = useState<ProfileLookRecord[]>([]);
  const [loading, setLoading] = useState({ liked: true, disliked: true, favourites: true });
  const [error, setError] = useState<string | null>(null);
  const [selectedLook, setSelectedLook] = useState<ProfileLookRecord | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const thumbnailWidth = Math.floor((screenWidth - 48) / 2);
  const selectionMode = selectedKeys.size > 0;

  useEffect(() => {
    setActiveTab(normalizeInitialTab(params.tab));
  }, [params.tab]);

  useEffect(() => {
    if (!user?.uid) {
      setLiked([]);
      setDisliked([]);
      setFavourites([]);
      setLoading({ liked: false, disliked: false, favourites: false });
      return;
    }

    setLoading({ liked: true, disliked: true, favourites: true });
    setError(null);
    const handleError = (nextError: Error) => {
      setError(nextError.message || "Unable to load your looks.");
      setLoading({ liked: false, disliked: false, favourites: false });
    };

    const unsubs = [
      subscribeProfileFeedbackLooks(user.uid, "outfit_liked", (records) => {
        setLiked(records);
        setLoading((prev) => ({ ...prev, liked: false }));
      }, handleError),
      subscribeProfileFeedbackLooks(user.uid, "outfit_disliked", (records) => {
        setDisliked(records);
        setLoading((prev) => ({ ...prev, disliked: false }));
      }, handleError),
      subscribeFavouriteLooks(user.uid, (records) => {
        setFavourites(records);
        setLoading((prev) => ({ ...prev, favourites: false }));
      }, handleError),
    ];

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [user?.uid]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [activeTab]);

  const recordsByTab: Record<TabKey, ProfileLookRecord[]> = {
    liked,
    disliked,
    favourites,
  };
  const currentRecords = recordsByTab[activeTab];
  const currentLoading = loading[activeTab];
  const selectedRecords = useMemo(
    () => currentRecords.filter((record) => selectedKeys.has(selectionKey(record))),
    [currentRecords, selectedKeys],
  );

  const clearSelection = () => setSelectedKeys(new Set());

  const toggleSelection = (record: ProfileLookRecord) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const key = selectionKey(record);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const startSelection = (record: ProfileLookRecord) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setSelectedKeys(new Set([selectionKey(record)]));
  };

  const handleThumbnailPress = (record: ProfileLookRecord) => {
    if (selectionMode) {
      toggleSelection(record);
      return;
    }
    setSelectedLook(record);
  };

  const runBulkAction = async (label: string, action: () => Promise<void>, clearAfter = true) => {
    if (!user?.uid || selectedRecords.length === 0 || bulkWorking) return;
    try {
      setBulkWorking(true);
      await action();
      if (clearAfter) clearSelection();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (nextError: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(label, nextError?.message ?? "Unable to update selected looks.");
    } finally {
      setBulkWorking(false);
    }
  };

  const confirmDelete = () => {
    if (!selectedRecords.length) return;
    Alert.alert(
      "Delete selected looks?",
      `Remove ${selectedRecords.length} selected ${selectedRecords.length === 1 ? "look" : "looks"} from this collection?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void runBulkAction("Delete", async () => {
              if (!user?.uid) return;
              await removeProfileLooks(user.uid, selectedRecords);
            });
          },
        },
      ],
    );
  };

  const favouriteSelected = () => {
    void runBulkAction("Favourite", async () => {
      if (!user?.uid) return;
      await favouriteProfileLooks(user.uid, selectedRecords);
    });
  };

  const dislikeSelected = () => {
    void runBulkAction("Dislike", async () => {
      if (!user?.uid) return;
      await dislikeProfileLooks(user.uid, selectedRecords);
    });
  };

  const likeSelected = () => {
    void runBulkAction("Like", async () => {
      if (!user?.uid) return;
      await likeProfileLooks(user.uid, selectedRecords);
    });
  };

  const shareSelected = () => {
    void runBulkAction("Share", async () => {
      const title = selectedRecords.length === 1 ? selectedRecords[0]?.title || "AURA look" : "AURA looks";
      await Share.share({ title, message: buildShareMessage(selectedRecords) });
    });
  };

  return (
    <SafeScreen backgroundColor={colors.background} includeBottomInset={false} style={{ flex: 1 }}>
      {selectionMode ? (
        <View style={styles.selectionToolbar}>
          <Pressable onPress={clearSelection} style={styles.toolbarButton} accessibilityRole="button">
            <Text style={styles.toolbarText}>Cancel</Text>
          </Pressable>
          <Text style={styles.selectionTitle}>{selectedKeys.size} selected</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarActions}>
            <Pressable disabled={bulkWorking} onPress={confirmDelete} style={styles.toolbarPill}>
              <Text style={[styles.toolbarPillText, styles.deleteText]}>
                {activeTab === "favourites" ? "Remove" : "Delete"}
              </Text>
            </Pressable>
            {activeTab === "disliked" ? (
              <Pressable disabled={bulkWorking} onPress={likeSelected} style={styles.toolbarPill}>
                <Text style={styles.toolbarPillText}>Like</Text>
              </Pressable>
            ) : null}
            {activeTab !== "favourites" ? (
              <Pressable disabled={bulkWorking} onPress={favouriteSelected} style={styles.toolbarPill}>
                <Text style={styles.toolbarPillText}>Favourite</Text>
              </Pressable>
            ) : null}
            {activeTab !== "disliked" ? (
              <Pressable disabled={bulkWorking} onPress={dislikeSelected} style={styles.toolbarPill}>
                <Text style={styles.toolbarPillText}>Dislike</Text>
              </Pressable>
            ) : null}
            <Pressable disabled={bulkWorking} onPress={shareSelected} style={styles.toolbarPill}>
              <Text style={styles.toolbarPillText}>Share</Text>
            </Pressable>
          </ScrollView>
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
              <Text style={styles.backText}>←</Text>
            </Pressable>
            <Text style={styles.headerTitle}>My Looks</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.tabContainer}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              const count = recordsByTab[tab.key].length;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[styles.tab, active ? styles.activeTab : null]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.tabText, active ? styles.activeTabText : null]}>
                    {tab.label} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {error ? (
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>Couldn’t load My Looks</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {currentLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <MyLookSkeleton key={index} width={thumbnailWidth} />
              ))
            : currentRecords.length
              ? currentRecords.map((record) => (
                  <MyLookThumbnail
                    key={`${record.collection}-${record.id}`}
                    record={record}
                    width={thumbnailWidth}
                    onPress={() => handleThumbnailPress(record)}
                    onLongPress={() => startSelection(record)}
                    selected={selectedKeys.has(selectionKey(record))}
                    selectionMode={selectionMode}
                  />
                ))
              : <EmptyState tab={activeTab} />}
        </ScrollView>
      )}

      <LookDetailModal
        visible={Boolean(selectedLook)}
        record={selectedLook}
        onClose={() => setSelectedLook(null)}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    color: palette.textPrimary,
    fontSize: 26,
    fontWeight: "700",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: "900",
  },
  headerSpacer: {
    width: 44,
  },
  selectionToolbar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.background,
  },
  toolbarButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  toolbarText: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  selectionTitle: {
    position: "absolute",
    top: 20,
    left: 0,
    right: 0,
    color: palette.textPrimary,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "900",
  },
  toolbarActions: {
    gap: 8,
    paddingRight: 4,
  },
  toolbarPill: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.chipBackground,
    borderWidth: 1,
    borderColor: palette.borderStrong,
  },
  toolbarPillText: {
    color: palette.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  deleteText: {
    color: palette.danger,
  },
  tabContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 3,
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
  },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  activeTab: {
    backgroundColor: palette.surfaceElevated,
  },
  tabText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  activeTabText: {
    color: palette.textPrimary,
    fontWeight: "600",
  },
  grid: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 140,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 16,
    rowGap: 18,
    minHeight: "78%",
  },
  emptyState: {
    flex: 1,
    minHeight: 420,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyIcon: {
    color: palette.borderStrong,
    fontSize: 48,
    lineHeight: 56,
    fontWeight: "800",
  },
  emptyTitle: {
    marginTop: 8,
    color: palette.textSecondary,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  emptySubtext: {
    marginTop: 8,
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  emptyButton: {
    marginTop: 18,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.chipBackground,
    borderWidth: 1,
    borderColor: palette.borderStrong,
  },
  emptyButtonText: {
    color: palette.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  errorState: {
    padding: 24,
    gap: 8,
  },
  errorTitle: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  errorText: {
    color: palette.textSecondary,
    lineHeight: 20,
  },
});
