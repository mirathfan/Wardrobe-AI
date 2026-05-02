import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  Share,
  ScrollView,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { deleteDoc, doc, getDoc, updateDoc, writeBatch } from "firebase/firestore";

import { ClosetControlsRow } from "@/src/components/closet/ClosetControlsRow";
import { ClosetFilterSheet } from "@/src/components/closet/ClosetFilterSheet";
import { ClosetHeader } from "@/src/components/closet/ClosetHeader";
import { ClosetItemCard } from "@/src/components/closet/ClosetItemCard";
import MinimumClosetProgressCard from "@/src/components/closet/MinimumClosetProgressCard";
import { ClosetProcessingSection } from "@/src/components/closet/ClosetProcessingSection";
import { ClosetSearchBar } from "@/src/components/closet/ClosetSearchBar";
import AuraPressable from "@/src/components/aura/AuraPressable";
import type { ChatImageAttachment } from "@/src/components/ai/chatTypes";
import {
  CATEGORY_LABELS,
  type CategoryKey,
  type ClosetListRow,
  type ClosetSection,
  buildClosetListRows,
  buildSections,
  normalizeText,
  searchMatches,
  sortItems,
  type SortMode,
  toMillis,
  validHttpUrl,
} from "@/src/closet/closetListModel";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { FLOATING_CONTROL_GAP, FLOATING_TAB_BAR_HEIGHT } from "@/src/constants/dock";
import { db } from "@/src/lib/firebase";
import {
  createAuraItemDraftsFromImages,
  uploadAuraAttachments,
} from "@/src/lib/auraAttachments";
import {
  type ClosetItem,
  getItemLifecycleStatus,
  isProcessingWardrobeItem,
  isVisibleWardrobeItem,
  listenToItems,
  normalizeLaundryStatus,
  safeMarkWorn,
  toCanonicalCategory,
} from "@/src/lib/items";
import { logItemStyleEvent } from "@/src/lib/auraMemory";
import {
  getMinimumClosetProgress,
  getSuggestedAddItemCategory,
  MINIMUM_CLOSET_TARGETS,
  MINIMUM_CLOSET_UNLOCK_ITEM_COUNT,
} from "@/src/lib/minimumCloset";
import { getStyleProfileConfig } from "@/src/lib/styleProfile";
import { Toast } from "@/src/lib/toast";
import { loadUserProfilePreferences } from "@/src/lib/userProfile";
import { getCachedProfilePreferences } from "@/src/lib/localCache";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { ClothingStatus } from "@/src/types/ClothingItem";
import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "RECENTLY_ADDED", label: "Recently added" },
  { key: "RECENTLY_WORN", label: "Recently worn" },
  { key: "BRAND", label: "Brand" },
  { key: "MOST_WORN", label: "Most worn" },
];

const STATUS_OPTIONS: { key: "ALL" | ClothingStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "AVAILABLE", label: "Clean" },
  { key: "WORN", label: "Needs wash" },
  { key: "IN_LAUNDRY", label: "In laundry" },
];

const PROCESSING_STALE_TIMEOUT_MS = 15 * 60 * 1000;
const DEBUG_CLOSET_CLIENT = __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";
const FIRST_CLOSET_AURA_PROMPT =
  "My closet is empty. What should I add first so AURA can build strong outfits? Give me a concise starter plan with tops, bottoms, footwear, one layer, and one accessory.";

const FIRST_CLOSET_TARGETS = [
  { key: "tops", label: "Tops", target: MINIMUM_CLOSET_TARGETS.tops },
  { key: "bottoms", label: "Bottoms", target: MINIMUM_CLOSET_TARGETS.bottoms },
  { key: "footwear", label: "Footwear", target: MINIMUM_CLOSET_TARGETS.footwear },
  { key: "outerwear", label: "Outerwear", target: MINIMUM_CLOSET_TARGETS.outerwear },
  { key: "accessories", label: "Accessory", target: MINIMUM_CLOSET_TARGETS.accessories },
] as const;

function debugClosetLog(...args: Parameters<typeof console.log>) {
  if (DEBUG_CLOSET_CLIENT) {
    console.log(...args);
  }
}

const closetRowKeyExtractor = (row: ClosetListRow) => row.key;

const ClosetListSeparator = React.memo(function ClosetListSeparator() {
  return <View style={{ height: 14 }} />;
});

const ClosetEmptyState = React.memo(function ClosetEmptyState({
  filtered,
  onAddItem,
  onAskAura,
  onClearFilters,
}: {
  filtered: boolean;
  onAddItem: () => void;
  onAskAura: () => void;
  onClearFilters: () => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  return (
    <View
      style={{
        borderRadius: layout.largeRadius,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
        padding: layout.cardPadding + 2,
        gap: 16,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.purpleSurface,
          borderWidth: 1,
          borderColor: colors.purpleBorder,
        }}
      >
        <Ionicons name={filtered ? "search-outline" : "shirt-outline"} size={21} color={colors.ctaCream} />
      </View>
      <View style={{ gap: 7 }}>
        <Text style={{ color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "900" }}>
          {filtered ? "No pieces match these filters" : "Your closet is ready for its first pieces"}
        </Text>
        <Text style={{ color: colors.textSecondary, lineHeight: 21 }}>
          {filtered
            ? "Broaden the view and Closet will get back to the category-first browser."
            : "Add a few clean photos so AURA can start building outfits from what you actually own."}
        </Text>
      </View>
      {!filtered ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.lightPurple, fontSize: 11, fontWeight: "900", letterSpacing: 1 }}>
            {MINIMUM_CLOSET_UNLOCK_ITEM_COUNT}-PIECE STYLE CORE
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {FIRST_CLOSET_TARGETS.map((target) => (
              <View
                key={target.key}
                style={{
                  flexGrow: 1,
                  flexBasis: "30%",
                  minWidth: 104,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.chipBackground,
                  paddingHorizontal: 10,
                  paddingVertical: 9,
                  gap: 2,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: "900" }}>
                  {target.target}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }} numberOfLines={1}>
                  {target.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <AuraPressable
          onPress={filtered ? onClearFilters : onAddItem}
          haptic="selection"
          hapticTrigger="press"
          pressedScale={0.97}
          style={{
            borderRadius: 999,
            backgroundColor: colors.ctaCream,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: colors.ctaText, fontSize: 13, fontWeight: "900" }}>
            {filtered ? "Clear filters" : "Add item"}
          </Text>
        </AuraPressable>
        <AuraPressable
          onPress={onAskAura}
          haptic="selection"
          hapticTrigger="press"
          pressedScale={0.97}
          style={{
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSoft,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "900" }}>
            {filtered ? "Ask AURA" : "Ask AURA what to add first"}
          </Text>
        </AuraPressable>
      </View>
    </View>
  );
});

const ClosetSectionHeader = React.memo(function ClosetSectionHeader({
  section,
  expanded,
  onToggle,
}: {
  section: ClosetSection;
  expanded: boolean;
  onToggle: (sectionKey: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 14 }}>
      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.055)" }} />
      <AuraPressable
        onPress={() => onToggle(section.key)}
        haptic="selection"
        hapticTrigger="press"
        pressedScale={0.99}
        pressedOpacity={0.9}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          paddingVertical: 4,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 0 }}>
            {section.title}
          </Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: colors.overlay,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontWeight: "800" }}>
              {section.itemCount}
            </Text>
          </View>
        </View>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.overlay,
          }}
        >
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
        </View>
      </AuraPressable>
    </View>
  );
});

const ClosetSubcategoryHeader = React.memo(function ClosetSubcategoryHeader({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  return (
    <View style={{ gap: 9, paddingTop: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "800", letterSpacing: 0.2 }}>
          {label}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700", opacity: 0.75 }}>
          {count}
        </Text>
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: colors.border,
          opacity: 0.5,
          marginRight: layout.horizontalPadding * 0.35,
        }}
      />
    </View>
  );
});

type ClosetGridRowProps = {
  items: ClosetItem[];
  cardWidth: number;
  gridGap: number;
  animateOffset: number;
  selectedItemIds: Set<string>;
  onPressItem: (item: ClosetItem) => void;
  onLongPressItem: (item: ClosetItem) => void;
};

const ClosetGridRow = React.memo(
  function ClosetGridRow({
    items,
    cardWidth,
    gridGap,
    animateOffset,
    selectedItemIds,
    onPressItem,
    onLongPressItem,
  }: ClosetGridRowProps) {
    return (
      <View style={{ flexDirection: "row", gap: gridGap }}>
        {items.map((item, index) => (
          <ClosetItemCard
            key={item.id}
            item={item}
            onPressItem={onPressItem}
            onLongPressItem={onLongPressItem}
            selected={selectedItemIds.has(item.id)}
            width={cardWidth}
            animateIndex={animateOffset + index}
          />
        ))}
      </View>
    );
  },
  (prev, next) =>
    prev.items === next.items &&
    prev.cardWidth === next.cardWidth &&
    prev.gridGap === next.gridGap &&
    prev.animateOffset === next.animateOffset &&
    prev.onPressItem === next.onPressItem &&
    prev.onLongPressItem === next.onLongPressItem &&
    prev.items.every((item) => prev.selectedItemIds.has(item.id) === next.selectedItemIds.has(item.id)),
);

export default function ClosetScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const uid = user?.uid ?? null;
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [profilePreferences, setProfilePreferences] = useState<UserProfilePreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("RECENTLY_ADDED");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ClothingStatus>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | CategoryKey>("ALL");
  const [brandFilter, setBrandFilter] = useState<string>("ALL");
  const [colorFilter, setColorFilter] = useState<string>("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [productLink, setProductLink] = useState("");
  const [productLinkTouched, setProductLinkTouched] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [locallyRemovedItemIds, setLocallyRemovedItemIds] = useState<Set<string>>(() => new Set());
  const staleFailoverIdsRef = React.useRef(new Set<string>());
  const closetCacheRefreshingRef = React.useRef(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    top: true,
    one_piece: true,
    outerwear: true,
    bottom: true,
    shoes: true,
    accessory: false,
  });

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setLoading(false);
      router.replace("/(auth)/welcome");
      return;
    }
    setItems([]);
    setLoading(true);
    const unsub = listenToItems(
      uid,
      (next, meta) => {
        if (meta?.source === "cache") {
          closetCacheRefreshingRef.current = !!meta.stale;
        } else {
          closetCacheRefreshingRef.current = false;
        }
        setItems(next);
        setLoading(false);
      },
      {
        includeDrafts: true,
        onError: (message) => {
          setLoading(false);
          Alert.alert("Closet", message || "Unable to load wardrobe.");
        },
      }
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      setProfilePreferences(null);
      return () => {
        cancelled = true;
      };
    }
    setProfilePreferences(null);
    void getCachedProfilePreferences(uid).then((cached) => {
      if (!cancelled && cached?.data) setProfilePreferences(cached.data);
    });
    void loadUserProfilePreferences(uid)
      .then((profile) => {
        if (!cancelled) setProfilePreferences(profile);
      })
      .catch(() => {
        if (!cancelled) setProfilePreferences(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const styleProfile = useMemo(
    () => getStyleProfileConfig(profilePreferences),
    [profilePreferences]
  );
  const categoryOrder = useMemo(
    () => styleProfile.categoryOrder as CategoryKey[],
    [styleProfile.categoryOrder]
  );

  const visibleItems = useMemo(
    () => items.filter((item) => isVisibleWardrobeItem(item)),
    [items]
  );
  const minimumClosetProgress = useMemo(
    () => getMinimumClosetProgress(visibleItems),
    [visibleItems]
  );
  const showMinimumClosetCard = !loading && !minimumClosetProgress.isUnlocked;
  const openAddMissingItem = React.useCallback(() => {
    const suggestedCategory = getSuggestedAddItemCategory(visibleItems);
    router.push({
      pathname: "/(tabs)/add",
      params: suggestedCategory ? { suggestedCategory } : {},
    });
  }, [visibleItems]);
  const processingItems = useMemo(
    () =>
      items
        .filter((item) => !locallyRemovedItemIds.has(item.id) && isProcessingWardrobeItem(item))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)),
    [items, locallyRemovedItemIds]
  );
  const normalizedProductLink = useMemo(() => validHttpUrl(productLink), [productLink]);
  const productLinkInlineError = useMemo(() => {
    const trimmed = productLink.trim();
    if (!trimmed || !productLinkTouched) return "";
    return normalizedProductLink ? "" : "Enter a valid http or https product link.";
  }, [normalizedProductLink, productLink, productLinkTouched]);

  useEffect(() => {
    if (!uid) return;
    const now = Date.now();
    processingItems.forEach((item) => {
      const lifecycle = getItemLifecycleStatus(item);
      if (lifecycle !== "processing") return;
      const lastRunAt =
        toMillis((item as any).ingestion?.lastRunAt) ||
        toMillis((item as any).updatedAt) ||
        toMillis(item.createdAt);
      if (!lastRunAt || now - lastRunAt < PROCESSING_STALE_TIMEOUT_MS) return;
      if (staleFailoverIdsRef.current.has(item.id)) return;
      staleFailoverIdsRef.current.add(item.id);
      debugClosetLog("[ITEM_PROCESSING_STALE]", {
        uid,
        itemId: item.id,
        lastRunAt,
        ageMs: now - lastRunAt,
      });
      void updateDoc(doc(db, "users", uid, "items", item.id), {
        draftState: "failed",
        itemLifecycleStatus: "failed",
        ingestionStatus: "failed",
        "ingestion.status": "failed",
        "ingestion.error": {
          message: "Processing timed out. Please retry or edit this item.",
          code: "client_stale_processing_timeout",
        },
        updatedAt: Date.now(),
      })
        .then(() => {
          debugClosetLog("[ITEM_PROCESSING_FAILOVER]", {
            uid,
            itemId: item.id,
            to: "failed",
          });
        })
        .catch((error) => {
          staleFailoverIdsRef.current.delete(item.id);
          debugClosetLog("[ITEM_PROCESSING_FAILOVER]", {
            uid,
            itemId: item.id,
            error,
          });
        });
    });
  }, [processingItems, uid]);

  const brandOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        visibleItems.map((item) => sanitizeDisplayText(item.brand)).filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return ["ALL", ...values];
  }, [visibleItems]);

  const colorOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        visibleItems
          .flatMap((item) => [item.primaryColor, ...(item.colors ?? [])])
          .map((value) => sanitizeDisplayText(value))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return ["ALL", ...values];
  }, [visibleItems]);

  const filteredItems = useMemo(() => {
    const query = normalizeText(search);
    return sortItems(
      visibleItems.filter((item) => {
        if (statusFilter !== "ALL") {
          const laundryStatus = normalizeLaundryStatus(item);
          if (statusFilter === "AVAILABLE" && laundryStatus !== "clean") return false;
          if (statusFilter === "WORN" && laundryStatus !== "needs_wash") return false;
          if (statusFilter === "IN_LAUNDRY" && laundryStatus !== "in_laundry") return false;
        }
        if (categoryFilter !== "ALL" && toCanonicalCategory(item.category) !== categoryFilter) return false;
        if (brandFilter !== "ALL" && sanitizeDisplayText(item.brand) !== brandFilter) return false;
        if (
          colorFilter !== "ALL" &&
          ![sanitizeDisplayText(item.primaryColor), ...(item.colors ?? []).map((value) => sanitizeDisplayText(value))].includes(colorFilter)
        ) {
          return false;
        }
        return searchMatches(item, query);
      }),
      sortMode
    );
  }, [brandFilter, categoryFilter, colorFilter, search, sortMode, statusFilter, visibleItems]);

  const sections = useMemo(
    () => buildSections(filteredItems, categoryOrder, styleProfile.emphasizedSubcategories),
    [categoryOrder, filteredItems, styleProfile.emphasizedSubcategories]
  );
  const closetRows = useMemo(
    () => (loading || sections.length === 0 ? [] : buildClosetListRows(sections, expandedSections)),
    [expandedSections, loading, sections],
  );
  const visibleCount = filteredItems.length;
  const isSelectionMode = selectedItemIds.size > 0;
  const selectedItems = useMemo(
    () => visibleItems.filter((item) => selectedItemIds.has(item.id)),
    [selectedItemIds, visibleItems]
  );
  const visibleItemIds = useMemo(() => new Set(visibleItems.map((item) => item.id)), [visibleItems]);
  const selectedVisibleCount = useMemo(
    () => Array.from(selectedItemIds).filter((itemId) => visibleItemIds.has(itemId)).length,
    [selectedItemIds, visibleItemIds]
  );
  const allFilteredItemsSelected =
    filteredItems.length > 0 && filteredItems.every((item) => selectedItemIds.has(item.id));
  const fabBottom =
    layout.floatingDockBottom +
    FLOATING_TAB_BAR_HEIGHT +
    FLOATING_CONTROL_GAP +
    Math.max(6, Math.round(layout.horizontalPadding * 0.2));
  const closetGridGap = 16;
  const closetGridCardWidth =
    (layout.width - layout.horizontalPadding * 2 - closetGridGap) / 2;

  useEffect(() => {
    setSelectedItemIds((prev) => {
      const next = new Set(Array.from(prev).filter((itemId) => visibleItemIds.has(itemId)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [visibleItemIds]);

  const clearSelection = React.useCallback(() => {
    setSelectedItemIds(new Set());
    setMoreActionsOpen(false);
  }, []);

  const toggleItemSelection = React.useCallback((itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleItemPress = React.useCallback(
    (item: ClosetItem) => {
      if (selectedItemIds.size > 0) {
        toggleItemSelection(item.id);
        return;
      }
      router.push({
        pathname: "/(tabs)/item/[id]",
        params: { id: item.id, sourceTab: "closet" },
      });
    },
    [selectedItemIds.size, toggleItemSelection]
  );

  const handleItemLongPress = React.useCallback(
    (item: ClosetItem) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSelectedItemIds((prev) => {
        if (prev.has(item.id)) return prev;
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
    },
    []
  );

  const handleToggleSection = React.useCallback((sectionKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !(prev[sectionKey] !== false),
    }));
  }, []);

  const handleSelectAllVisible = React.useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (allFilteredItemsSelected) {
      clearSelection();
      return;
    }
    setSelectedItemIds(new Set(filteredItems.map((item) => item.id)));
  }, [allFilteredItemsSelected, clearSelection, filteredItems]);

  const runBulkAction = React.useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (!uid || bulkActionLoading || selectedItems.length === 0) return;
      setBulkActionLoading(true);
      try {
        await action();
      } catch (error: any) {
        Alert.alert(label, error?.message ?? `Unable to ${label.toLowerCase()}.`);
      } finally {
        setBulkActionLoading(false);
      }
    },
    [bulkActionLoading, selectedItems.length, uid]
  );

  const applyBulkStatus = React.useCallback(
    async (status: ClothingStatus) => {
      if (!uid || selectedItems.length === 0) return;
      const batch = writeBatch(db);
      const now = Date.now();
      selectedItems.forEach((item) => {
        const ref = doc(db, "users", uid, "items", item.id);
        if (status === "AVAILABLE") {
          batch.update(ref, {
            status,
            laundryStatus: "clean",
            wearCountSinceWash: 0,
            lastWashedDate: now,
            lastWashedAt: now,
            laundryUpdatedAt: now,
            updatedAt: now,
          });
          return;
        }
        batch.update(ref, {
          status,
          laundryStatus: status === "IN_LAUNDRY" ? "in_laundry" : "needs_wash",
          laundryUpdatedAt: now,
          updatedAt: now,
        });
      });
      await batch.commit();
      clearSelection();
    },
    [clearSelection, selectedItems, uid]
  );

  const handleBulkDelete = React.useCallback(() => {
    if (!uid || selectedItems.length === 0 || bulkActionLoading) return;
    const count = selectedItems.length;
    Alert.alert(
      count === 1 ? "Delete selected item?" : `Delete ${count} selected items?`,
      "This permanently removes the selected closet items.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void runBulkAction("Delete", async () => {
              await Promise.all(
                selectedItems.map((item) => deleteDoc(doc(db, "users", uid, "items", item.id)))
              );
              clearSelection();
            });
          },
        },
      ]
    );
  }, [bulkActionLoading, clearSelection, runBulkAction, selectedItems, uid]);

  const handleBulkFavorite = React.useCallback(() => {
    void runBulkAction("Favorite", async () => {
      if (!uid || selectedItems.length === 0) return;
      const batch = writeBatch(db);
      const now = Date.now();
      selectedItems.forEach((item) => {
        batch.update(doc(db, "users", uid, "items", item.id), {
          isFavorite: true,
          updatedAt: now,
        });
      });
      await batch.commit();
      await Promise.all(
        selectedItems.map((item) =>
          logItemStyleEvent(uid, "item_favorited", {
            ...item,
            isFavorite: true,
          })
        )
      );
      clearSelection();
    });
  }, [clearSelection, runBulkAction, selectedItems, uid]);

  const handleBulkStyleSelected = React.useCallback(() => {
    if (selectedItems.length === 0) return;
    const names = selectedItems
      .slice(0, 8)
      .map((item) => sanitizeDisplayText(item.name) || sanitizeDisplayText(item.subCategory) || item.id)
      .filter(Boolean);
    const itemIds = selectedItems.map((item) => item.id);
    clearSelection();
    router.push({
      pathname: "/(tabs)/ai",
      params: {
        prompt:
          `Style a look using only these selected closet items from my wardrobe.\n` +
          `Selected item ids: ${itemIds.join(", ")}.\n` +
          `Selected pieces: ${names.join(", ")}.\n` +
          `Build from these first, keep it wearable, and tell me how to style them together.`,
        promptKey: `closet-selected-${Date.now()}`,
      },
    });
  }, [clearSelection, selectedItems]);

  const handleBulkShare = React.useCallback(() => {
    void runBulkAction("Share", async () => {
      const title = selectedItems.length === 1 ? "Wardrobe AI item" : "Wardrobe AI selection";
      const message =
        selectedItems.length === 1
          ? `${sanitizeDisplayText(selectedItems[0]?.name) || "Wardrobe item"}`
          : `Wardrobe AI selection (${selectedItems.length} items): ${selectedItems
              .map((item) => sanitizeDisplayText(item.name) || sanitizeDisplayText(item.subCategory) || item.id)
              .join(", ")}`;
      await Share.share({ title, message });
    });
  }, [runBulkAction, selectedItems]);

  const handleBulkMarkWorn = React.useCallback(() => {
    void runBulkAction("Mark worn", async () => {
      if (!uid || selectedItems.length === 0) return;
      const failures: string[] = [];
      for (const item of selectedItems) {
        try {
          await safeMarkWorn(uid, item.id);
        } catch (error: any) {
          failures.push(
            sanitizeDisplayText(item.name) ||
              error?.message ||
              item.id
          );
        }
      }
      clearSelection();
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      if (failures.length) {
        Alert.alert(
          "Some items were skipped",
          failures.length === selectedItems.length
            ? "None of the selected items could be marked worn."
            : `${failures.length} selected item(s) could not be marked worn.`
        );
      }
    });
  }, [clearSelection, runBulkAction, selectedItems, uid]);

  function localAttachmentId() {
    return `quick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const createDraftsFromAssets = React.useCallback(
    async (assets: ImagePicker.ImagePickerAsset[], source: "camera" | "library") => {
      if (!uid) return;
      const images: ChatImageAttachment[] = assets
        .filter((asset) => !!asset.uri)
        .map((asset) => ({
          id: localAttachmentId(),
          type: "image",
          uri: asset.uri,
          localUri: asset.uri,
          role: assets.length > 1 ? "separate_items" : "same_item",
          groupId: `quick-${Date.now()}`,
          width: asset.width ?? null,
          height: asset.height ?? null,
        }));
      if (!images.length) return;
      setQuickAdding(true);
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const uploaded = await uploadAuraAttachments(uid, images);
        const uploadedImages = uploaded.filter(
          (attachment): attachment is ChatImageAttachment => attachment.type === "image"
        );
        await createAuraItemDraftsFromImages({
          uid,
          images: uploadedImages,
          mode: uploadedImages.length > 1 ? "separate_items" : "same_item",
          prompt: source === "camera" ? "Quick add camera photo" : "Quick add photo library",
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setQuickAddOpen(false);
        Toast.itemAdded();
      } catch (error: any) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Toast.error("Quick add failed", error?.message ?? "Unable to add that item.");
      } finally {
        setQuickAdding(false);
      }
    },
    [uid]
  );

  const handleChoosePhotos = React.useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photos", "Please allow photo access to add items.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      allowsEditing: false,
      quality: 0.9,
      exif: false,
    });
    if (!result.canceled) {
      await createDraftsFromAssets(result.assets ?? [], "library");
    }
  }, [createDraftsFromAssets]);

  const handleTakePhoto = React.useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera", "Please allow camera access to add an item.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
      exif: false,
    });
    if (!result.canceled) {
      await createDraftsFromAssets(result.assets ?? [], "camera");
    }
  }, [createDraftsFromAssets]);

  const startProductLinkReview = React.useCallback(async (rawUrl: string, source: "clipboard" | "manual") => {
    const url = validHttpUrl(rawUrl);
    debugClosetLog("[PASTE_LINK_UI]", "search submitted", {
      uid,
      source,
      hasUrl: !!url,
      rawLength: rawUrl.length,
    });
    if (!url || !uid) {
      debugClosetLog("[PASTE_LINK_UI]", "invalid url", {
        uid,
        source,
        rawUrl,
      });
      setProductLinkTouched(true);
      return;
    }
    setQuickAdding(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setProductLink("");
      setProductLinkTouched(false);
      setLinkModalOpen(false);
      setQuickAddOpen(false);
      router.push({
        pathname: "/(tabs)/ai",
        params: {
          prompt: url,
          promptKey: `closet-product-link-${Date.now()}`,
        },
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Product link", error?.message ?? "Unable to start link review.");
    } finally {
      setQuickAdding(false);
    }
  }, [uid]);

  const handlePasteProductLinkAction = React.useCallback(() => {
    debugClosetLog("[PASTE_LINK_UI]", "opened", { uid });
    setProductLink("");
    setProductLinkTouched(false);
    setQuickAddOpen(false);
    setLinkModalOpen(true);
  }, [uid]);

  const handlePasteFromClipboard = React.useCallback(async () => {
    try {
      const clipboard = await Clipboard.getStringAsync();
      debugClosetLog("[PASTE_LINK_UI]", "pasted from clipboard", {
        uid,
        hasClipboardText: !!clipboard?.trim(),
        hasValidUrl: !!validHttpUrl(clipboard),
      });
      setProductLink(clipboard ?? "");
      setProductLinkTouched(true);
    } catch (error) {
      debugClosetLog("[PASTE_LINK_UI]", "pasted from clipboard", {
        uid,
        hasClipboardText: false,
        hasValidUrl: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }, [uid]);

  const handleImportProductLink = React.useCallback(async () => {
    if (!normalizedProductLink) {
      debugClosetLog("[PASTE_LINK_UI]", "invalid url", {
        uid,
        rawUrl: productLink,
      });
      setProductLinkTouched(true);
      return;
    }
    await startProductLinkReview(productLink, "manual");
  }, [normalizedProductLink, productLink, startProductLinkReview, uid]);

  const handleRetryProcessingItem = React.useCallback(
    async (item: ClosetItem) => {
      if (!uid) return;
      await updateDoc(doc(db, "users", uid, "items", item.id), {
        ingestionStatus: "pending",
        itemLifecycleStatus: "processing",
        "ingestion.status": "pending",
        "ingestion.lastRunAt": Date.now(),
        updatedAt: Date.now(),
      });
    },
    [uid]
  );

  const handleReviewProcessingItem = React.useCallback(
    (item: ClosetItem) => {
      if (!item?.id) {
        debugClosetLog("[CLOSET_REVIEW_ERROR]", "missing item id", { item });
        Alert.alert("Review unavailable", "This item is no longer available.");
        return;
      }
      debugClosetLog("[CLOSET_REVIEW]", "opening draft review", {
        uid,
        itemId: item.id,
        draftState: (item as any).draftState ?? null,
        itemLifecycleStatus: (item as any).itemLifecycleStatus ?? null,
        ingestionStatus: (item as any).ingestionStatus ?? (item as any).ingestion?.status ?? null,
      });
      router.push({
        pathname: "/(tabs)/add",
        params: { editId: item.id },
      });
    },
    [uid]
  );

  const handleRemoveProcessingItem = React.useCallback(
    async (item: ClosetItem) => {
      if (!uid) return;
      const itemRef = doc(db, "users", uid, "items", item.id);
      setLocallyRemovedItemIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      debugClosetLog("[ITEM_REMOVE]", "removing unfinished item", {
        uid,
        itemId: item.id,
        path: `users/${uid}/items/${item.id}`,
        mode: "hard_delete",
        draftState: (item as any).draftState ?? null,
        itemLifecycleStatus: (item as any).itemLifecycleStatus ?? null,
      });
      try {
        await updateDoc(itemRef, {
          draftState: "cancelled",
          itemLifecycleStatus: "deleted",
          removedAt: Date.now(),
          updatedAt: Date.now(),
        });
        await deleteDoc(itemRef);
        const afterDelete = await getDoc(itemRef);
        debugClosetLog("[ITEM_REMOVE_SUCCESS]", {
          uid,
          itemId: item.id,
          existsAfterDelete: afterDelete.exists(),
        });
      } catch (error) {
        setLocallyRemovedItemIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        debugClosetLog("[ITEM_REMOVE_ERROR]", {
          uid,
          itemId: item.id,
          error,
        });
        Alert.alert("Remove failed", "That item could not be removed. Please try again.");
      }
    },
    [uid]
  );

  const renderClosetRow = React.useCallback(
    ({ item }: { item: ClosetListRow }) => {
      if (item.type === "section") {
        return (
          <ClosetSectionHeader
            section={item.section}
            expanded={item.expanded}
            onToggle={handleToggleSection}
          />
        );
      }
      if (item.type === "subcategory") {
        return <ClosetSubcategoryHeader label={item.label} count={item.count} />;
      }
      return (
        <ClosetGridRow
          items={item.items}
          cardWidth={closetGridCardWidth}
          gridGap={closetGridGap}
          animateOffset={item.animateOffset}
          selectedItemIds={selectedItemIds}
          onPressItem={handleItemPress}
          onLongPressItem={handleItemLongPress}
        />
      );
    },
    [
      closetGridCardWidth,
      closetGridGap,
      handleItemLongPress,
      handleItemPress,
      handleToggleSection,
      selectedItemIds,
    ],
  );

  const closetListHeader = useMemo(() => {
    if (!processingItems.length && !showMinimumClosetCard) return null;
    return (
      <View style={{ gap: 18, marginBottom: 18 }}>
        <ClosetProcessingSection
          items={processingItems}
          onPressItem={handleReviewProcessingItem}
          onRetry={(item) => void handleRetryProcessingItem(item)}
          onRemove={(item) => void handleRemoveProcessingItem(item)}
        />

        {showMinimumClosetCard ? (
          <MinimumClosetProgressCard
            colors={colors}
            items={visibleItems}
            onAddMissingItem={openAddMissingItem}
          />
        ) : null}
      </View>
    );
  }, [
    colors,
    handleRemoveProcessingItem,
    handleRetryProcessingItem,
    handleReviewProcessingItem,
    openAddMissingItem,
    processingItems,
    showMinimumClosetCard,
    visibleItems,
  ]);

  const clearFilters = React.useCallback(() => {
    setSearch("");
    setSortMode("RECENTLY_ADDED");
    setStatusFilter("ALL");
    setCategoryFilter("ALL");
    setBrandFilter("ALL");
    setColorFilter("ALL");
  }, []);

  const closetListEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }

    return (
      <ClosetEmptyState
        filtered={visibleItems.length > 0}
        onAddItem={() => router.push("/(tabs)/add")}
        onAskAura={() => {
          if (visibleItems.length > 0) {
            router.push("/(tabs)/ai");
            return;
          }
          router.push({
            pathname: "/(tabs)/ai",
            params: {
              prompt: FIRST_CLOSET_AURA_PROMPT,
              promptKey: `closet-empty-${Date.now()}`,
            },
          });
        }}
        onClearFilters={clearFilters}
      />
    );
  }, [clearFilters, colors.accent, loading, visibleItems.length]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: layout.topContentInset,
          paddingHorizontal: layout.horizontalPadding,
          paddingBottom: 14,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.045)",
          gap: 14,
        }}
      >
        <ClosetHeader
          totalCount={visibleItems.length}
          visibleCount={visibleCount}
          statusFilter={statusFilter}
        />

        {isSelectionMode ? (
          <View
            style={{
              gap: 12,
              padding: 12,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <View style={{ gap: 2, flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900" }}>
                  {selectedVisibleCount} selected
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Tap more pieces to add them, or tap again to deselect.
                </Text>
              </View>
              <Pressable
                onPress={handleSelectAllVisible}
                disabled={bulkActionLoading}
                style={({ pressed }) => ({
                  height: 36,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.07)",
                  opacity: bulkActionLoading ? 0.5 : pressed ? 0.78 : 1,
                })}
              >
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800" }}>
                  {allFilteredItemsSelected ? "Clear" : "Select all"}
                </Text>
              </Pressable>
              <Pressable
                onPress={clearSelection}
                disabled={bulkActionLoading}
                style={({ pressed }) => ({
                  height: 36,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.overlay,
                  opacity: bulkActionLoading ? 0.5 : pressed ? 0.78 : 1,
                })}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>
                  Cancel
                </Text>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            >
              <BulkActionPill
                icon="trash-outline"
                label="Delete"
                tone="destructive"
                disabled={bulkActionLoading}
                onPress={handleBulkDelete}
              />
              <BulkActionPill
                icon="shirt-outline"
                label="Laundry"
                disabled={bulkActionLoading}
                onPress={() => void runBulkAction("Move to laundry", async () => applyBulkStatus("IN_LAUNDRY"))}
              />
              <BulkActionPill
                icon="refresh-outline"
                label="Available"
                disabled={bulkActionLoading}
                onPress={() => void runBulkAction("Mark available", async () => applyBulkStatus("AVAILABLE"))}
              />
              <BulkActionPill
                icon="star-outline"
                label="Favorite"
                disabled={bulkActionLoading}
                onPress={handleBulkFavorite}
              />
              <BulkActionPill
                icon="sparkles-outline"
                label="Style selected"
                disabled={bulkActionLoading}
                onPress={handleBulkStyleSelected}
              />
              <BulkActionPill
                icon="ellipsis-horizontal"
                label="More"
                disabled={bulkActionLoading}
                onPress={() => setMoreActionsOpen(true)}
              />
            </ScrollView>
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          <ClosetSearchBar value={search} onChangeText={setSearch} />

          <ClosetControlsRow
            sortLabel={SORT_OPTIONS.find((option) => option.key === sortMode)?.label ?? "Recently added"}
            statusLabel={STATUS_OPTIONS.find((option) => option.key === statusFilter)?.label ?? "All"}
            onOpenFilters={() => setFiltersOpen(true)}
          />
        </View>
      </View>

      <FlatList
        data={closetRows}
        keyExtractor={closetRowKeyExtractor}
        renderItem={renderClosetRow}
        ListHeaderComponent={closetListHeader}
        ListEmptyComponent={closetListEmpty}
        ItemSeparatorComponent={ClosetListSeparator}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS !== "web"}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        extraData={selectedItemIds}
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 18,
          paddingBottom: layout.bottomDockPadding + 112,
        }}
      />

      <ClosetFilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        sortMode={sortMode}
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
        brandFilter={brandFilter}
        colorFilter={colorFilter}
        sortOptions={SORT_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        categoryOptions={[{ key: "ALL", label: "All categories" }, ...categoryOrder.map((key) => ({ key, label: CATEGORY_LABELS[key] }))]}
        brandOptions={brandOptions}
        colorOptions={colorOptions}
        onChangeSort={setSortMode}
        onChangeStatus={setStatusFilter}
        onChangeCategory={setCategoryFilter}
        onChangeBrand={setBrandFilter}
        onChangeColor={setColorFilter}
        onClear={clearFilters}
      />

      <Pressable
        onPress={() => setQuickAddOpen(true)}
        style={({ pressed }) => ({
          position: "absolute",
          right: layout.horizontalPadding,
          bottom: fabBottom,
          width: 56,
          height: 56,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(20,24,32,0.84)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
          shadowColor: "#000",
          shadowOpacity: 0.28,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 18,
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <View
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        />
        <Ionicons name="add" size={26} color={colors.text} />
      </Pressable>

      <Modal
        visible={moreActionsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMoreActionsOpen(false)}
      >
        <Pressable
          onPress={() => setMoreActionsOpen(false)}
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.48)",
            paddingHorizontal: layout.horizontalPadding,
            paddingBottom: layout.composerOffset + 18,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              borderRadius: 28,
              padding: 16,
              gap: 10,
              backgroundColor: "rgba(18,22,29,0.98)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
              More actions
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              {selectedItems.length} selected item{selectedItems.length === 1 ? "" : "s"}
            </Text>
            <QuickAddAction
              icon="share-social-outline"
              label="Share"
              disabled={bulkActionLoading}
              onPress={handleBulkShare}
            />
            <QuickAddAction
              icon="checkmark-done-outline"
              label="Mark Worn"
              disabled={bulkActionLoading}
              onPress={handleBulkMarkWorn}
            />
            <QuickAddAction
              icon="pricetags-outline"
              label="Edit Tags / Bulk Edit"
              disabled
              onPress={() => {}}
            />
            <QuickAddAction
              icon="albums-outline"
              label="Add to Collection"
              disabled
              onPress={() => {}}
            />
            <QuickAddAction
              icon="calendar-outline"
              label="Plan to Calendar"
              disabled
              onPress={() => {}}
            />
            <QuickAddAction
              icon="archive-outline"
              label="Archive / Hide"
              disabled
              onPress={() => {}}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={quickAddOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setQuickAddOpen(false)}
      >
        <Pressable
          onPress={() => setQuickAddOpen(false)}
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.42)",
            paddingHorizontal: layout.horizontalPadding,
            paddingBottom: layout.composerOffset + 18,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              borderRadius: 28,
              padding: 16,
              gap: 10,
              backgroundColor: "rgba(18,22,29,0.98)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
              Add to wardrobe
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              Snap it, and Wardrobe AI will process it in the background.
            </Text>
            <QuickAddAction
              icon="camera-outline"
              label="Take Photo"
              disabled={quickAdding}
              onPress={() => void handleTakePhoto()}
            />
            <QuickAddAction
              icon="images-outline"
              label="Choose Photos"
              disabled={quickAdding}
              onPress={() => void handleChoosePhotos()}
            />
            <QuickAddAction
              icon="link-outline"
              label="Paste Product Link"
              disabled={quickAdding}
              onPress={handlePasteProductLinkAction}
            />
            <QuickAddAction
              icon="create-outline"
              label="Add Manually"
              disabled={quickAdding}
              onPress={() => {
                setQuickAddOpen(false);
                router.push("/(tabs)/add");
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={linkModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLinkModalOpen(false)}
      >
        <Pressable
          onPress={() => setLinkModalOpen(false)}
          style={{
            flex: 1,
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.54)",
            paddingHorizontal: layout.horizontalPadding,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              borderRadius: 26,
              padding: 16,
              gap: 12,
              backgroundColor: "rgba(18,22,29,0.98)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
              Paste product link
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              Paste or type a product URL, then review it in AURA before saving.
            </Text>
            <TextInput
              value={productLink}
              onChangeText={(value) => {
                setProductLink(value);
                setProductLinkTouched(true);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance="dark"
              placeholder="https://..."
              placeholderTextColor={colors.textSecondary}
              onSubmitEditing={() => void handleImportProductLink()}
              style={{
                minHeight: 50,
                borderRadius: 18,
                paddingHorizontal: 14,
                color: colors.text,
                backgroundColor: "rgba(255,255,255,0.055)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            />
            {productLinkInlineError ? (
              <Text style={{ color: "#ff9b9b", fontSize: 12, lineHeight: 16 }}>
                {productLinkInlineError}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => void handlePasteFromClipboard()}
                disabled={quickAdding}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 48,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.055)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  opacity: quickAdding ? 0.55 : pressed ? 0.82 : 1,
                })}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>
                  Paste
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleImportProductLink()}
                disabled={quickAdding || !normalizedProductLink}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 48,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.aiAccent,
                  opacity: quickAdding || !normalizedProductLink ? 0.55 : pressed ? 0.86 : 1,
                })}
              >
                <Text style={{ color: "#081019", fontSize: 14, fontWeight: "900" }}>
                  {quickAdding ? "Searching..." : "Search"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function QuickAddAction({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        height: 52,
        borderRadius: 18,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: "rgba(255,255,255,0.055)",
        opacity: disabled ? 0.5 : pressed ? 0.76 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function BulkActionPill({
  icon,
  label,
  onPress,
  disabled,
  tone = "default",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "default" | "destructive";
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minWidth: 86,
        height: 54,
        paddingHorizontal: 14,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        backgroundColor:
          tone === "destructive" ? "rgba(126,32,32,0.32)" : "rgba(255,255,255,0.055)",
        borderWidth: 1,
        borderColor:
          tone === "destructive" ? "rgba(255,120,120,0.24)" : "rgba(255,255,255,0.08)",
        opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
      })}
    >
      <Ionicons
        name={icon}
        size={18}
        color={tone === "destructive" ? "#ffb1b1" : colors.text}
      />
      <Text
        style={{
          color: tone === "destructive" ? "#ffd1d1" : colors.text,
          fontSize: 11.5,
          fontWeight: "800",
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
