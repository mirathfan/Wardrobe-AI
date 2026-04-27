import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { ClosetCategorySection } from "@/src/components/closet/ClosetCategorySection";
import { ClosetControlsRow } from "@/src/components/closet/ClosetControlsRow";
import { ClosetFilterSheet } from "@/src/components/closet/ClosetFilterSheet";
import { ClosetHeader } from "@/src/components/closet/ClosetHeader";
import { ClosetProcessingSection } from "@/src/components/closet/ClosetProcessingSection";
import { ClosetSearchBar } from "@/src/components/closet/ClosetSearchBar";
import type { ChatImageAttachment } from "@/src/components/ai/chatTypes";
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
  type CanonicalCategory,
  type ClosetItem,
  getItemLifecycleStatus,
  isProcessingWardrobeItem,
  isVisibleWardrobeItem,
  listenToItems,
  safeMarkWorn,
  toCanonicalCategory,
} from "@/src/lib/items";
import { logItemStyleEvent } from "@/src/lib/auraMemory";
import { getStyleProfileConfig } from "@/src/lib/styleProfile";
import { Toast } from "@/src/lib/toast";
import { loadUserProfilePreferences } from "@/src/lib/userProfile";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { ClothingStatus } from "@/src/types/ClothingItem";
import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";

type SortMode = "RECENTLY_ADDED" | "RECENTLY_WORN" | "BRAND" | "MOST_WORN";
type CategoryKey = CanonicalCategory;

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  top: "Tops",
  one_piece: "One-pieces",
  outerwear: "Outerwear",
  bottom: "Bottoms",
  shoes: "Footwear",
  accessory: "Accessories",
};

const SUBCATEGORY_GROUPS: Record<CategoryKey, { label: string; matches: string[] }[]> = {
  top: [
    { label: "T-shirts", matches: ["t-shirt", "tshirt", "tee"] },
    { label: "Shirts", matches: ["shirt", "dress shirt"] },
    { label: "Blouses", matches: ["blouse"] },
    { label: "Crop tops", matches: ["crop_top", "crop top"] },
    { label: "Polos", matches: ["polo"] },
    { label: "Tanks", matches: ["tank"] },
    { label: "Sweaters", matches: ["sweater", "knit", "jumper"] },
    { label: "Hoodies", matches: ["hoodie", "sweatshirt"] },
  ],
  one_piece: [
    { label: "Dresses", matches: ["dress"] },
    { label: "Jumpsuits & rompers", matches: ["jumpsuit", "romper"] },
    { label: "Matching sets", matches: ["set", "matching_set"] },
  ],
  outerwear: [
    { label: "Jackets", matches: ["jacket"] },
    { label: "Coats", matches: ["coat", "parka", "trench"] },
    { label: "Overshirts", matches: ["overshirt", "shacket"] },
    { label: "Blazers", matches: ["blazer", "sport coat"] },
  ],
  bottom: [
    { label: "Jeans", matches: ["jeans", "denim"] },
    { label: "Trousers", matches: ["trousers", "pants", "slacks"] },
    { label: "Joggers", matches: ["joggers", "sweatpants"] },
    { label: "Shorts", matches: ["shorts"] },
    { label: "Skirts", matches: ["skirt"] },
  ],
  shoes: [
    { label: "Sneakers", matches: ["sneaker", "sneakers", "trainer"] },
    { label: "Loafers", matches: ["loafer", "loafers"] },
    { label: "Boots", matches: ["boot", "boots"] },
    { label: "Heels", matches: ["heel", "heels"] },
    { label: "Sandals", matches: ["sandal", "sandals", "slides"] },
  ],
  accessory: [
    { label: "Watches", matches: ["watch", "watches"] },
    { label: "Bags", matches: ["bag", "bags", "backpack", "tote", "handbag"] },
    { label: "Perfumes", matches: ["perfume", "fragrance", "cologne"] },
    { label: "Jewelry", matches: ["jewelry", "jewellery", "necklace", "ring", "bracelet", "earrings"] },
    { label: "Belts", matches: ["belt", "belts"] },
    { label: "Sunglasses", matches: ["sunglasses", "glasses"] },
    { label: "Caps", matches: ["cap", "caps", "hat", "beanie"] },
    { label: "Scarves", matches: ["scarf", "scarves"] },
  ],
};

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "RECENTLY_ADDED", label: "Recently added" },
  { key: "RECENTLY_WORN", label: "Recently worn" },
  { key: "BRAND", label: "Brand" },
  { key: "MOST_WORN", label: "Most worn" },
];

const STATUS_OPTIONS: { key: "ALL" | ClothingStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "AVAILABLE", label: "Available" },
  { key: "WORN", label: "Worn" },
  { key: "IN_LAUNDRY", label: "In Laundry" },
];

const PROCESSING_STALE_TIMEOUT_MS = 15 * 60 * 1000;

function validHttpUrl(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return date?.getTime?.() ?? 0;
  }
  return 0;
}

function itemSubcategory(item: ClosetItem) {
  return sanitizeDisplayText(item.subCategory) || sanitizeDisplayText(item.type) || "";
}

function subcategoryBucket(item: ClosetItem, category: CategoryKey) {
  const haystack = `${itemSubcategory(item)} ${sanitizeDisplayText(item.name)}`.toLowerCase();
  const group = SUBCATEGORY_GROUPS[category].find((option) =>
    option.matches.some((term) => haystack.includes(term))
  );
  return group?.label ?? "Other";
}

function searchMatches(item: ClosetItem, query: string) {
  if (!query) return true;
  const haystack = [
    item.name,
    item.brand,
    item.category,
    item.subCategory,
    item.type,
    item.primaryColor,
    ...(item.colors ?? []),
  ]
    .map((value) => normalizeText(value))
    .join(" ");
  return haystack.includes(query);
}

function sortItems(items: ClosetItem[], sortMode: SortMode) {
  const next = [...items];
  if (sortMode === "RECENTLY_WORN") {
    next.sort((a, b) => toMillis(b.lastWornDate) - toMillis(a.lastWornDate));
    return next;
  }
  if (sortMode === "BRAND") {
    next.sort((a, b) => normalizeText(a.brand).localeCompare(normalizeText(b.brand)));
    return next;
  }
  if (sortMode === "MOST_WORN") {
    next.sort((a, b) => Number(b.wearCountSinceWash ?? 0) - Number(a.wearCountSinceWash ?? 0));
    return next;
  }
  next.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  return next;
}

function buildSections(
  items: ClosetItem[],
  categoryOrder: CategoryKey[],
  emphasizedSubcategories: string[],
) {
  return categoryOrder.map((category) => {
    const inCategory = items.filter((item) => toCanonicalCategory(item.category) === category);
    const buckets = new Map<string, ClosetItem[]>();
    inCategory.forEach((item) => {
      const key = subcategoryBucket(item, category);
      const current = buckets.get(key) ?? [];
      current.push(item);
      buckets.set(key, current);
    });
    const subcategories = Array.from(buckets.entries())
      .map(([label, groupedItems]) => ({ label, items: groupedItems }))
      .sort((a, b) => {
        const aMatches = SUBCATEGORY_GROUPS[category]
          .find((option) => option.label === a.label)
          ?.matches.some((term) => emphasizedSubcategories.includes(term));
        const bMatches = SUBCATEGORY_GROUPS[category]
          .find((option) => option.label === b.label)
          ?.matches.some((term) => emphasizedSubcategories.includes(term));
        if (aMatches && !bMatches) return -1;
        if (bMatches && !aMatches) return 1;
        if (a.label === "Other") return 1;
        if (b.label === "Other") return -1;
        return a.label.localeCompare(b.label);
      });
    return {
      key: category,
      title: CATEGORY_LABELS[category],
      itemCount: inCategory.length,
      subcategories,
    };
  }).filter((section) => section.itemCount > 0);
}

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
      setLoading(false);
      router.replace("/(auth)/welcome");
      return;
    }
    setLoading(true);
    const unsub = listenToItems(uid, (next) => {
      setItems(next);
      setLoading(false);
    }, {
      includeDrafts: true,
      onError: (message) => {
        setLoading(false);
        Alert.alert("Closet", message || "Unable to load wardrobe.");
      },
    });
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
      console.log("[ITEM_PROCESSING_STALE]", {
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
          console.log("[ITEM_PROCESSING_FAILOVER]", {
            uid,
            itemId: item.id,
            to: "failed",
          });
        })
        .catch((error) => {
          staleFailoverIdsRef.current.delete(item.id);
          console.log("[ITEM_PROCESSING_FAILOVER]", {
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
        if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
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
            wearCountSinceWash: 0,
            lastWashedDate: now,
            updatedAt: now,
          });
          return;
        }
        batch.update(ref, {
          status,
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
    console.log("[PASTE_LINK_UI]", "search submitted", {
      uid,
      source,
      hasUrl: !!url,
      rawLength: rawUrl.length,
    });
    if (!url || !uid) {
      console.log("[PASTE_LINK_UI]", "invalid url", {
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
    console.log("[PASTE_LINK_UI]", "opened", { uid });
    setProductLink("");
    setProductLinkTouched(false);
    setQuickAddOpen(false);
    setLinkModalOpen(true);
  }, [uid]);

  const handlePasteFromClipboard = React.useCallback(async () => {
    try {
      const clipboard = await Clipboard.getStringAsync();
      console.log("[PASTE_LINK_UI]", "pasted from clipboard", {
        uid,
        hasClipboardText: !!clipboard?.trim(),
        hasValidUrl: !!validHttpUrl(clipboard),
      });
      setProductLink(clipboard ?? "");
      setProductLinkTouched(true);
    } catch (error) {
      console.log("[PASTE_LINK_UI]", "pasted from clipboard", {
        uid,
        hasClipboardText: false,
        hasValidUrl: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }, [uid]);

  const handleImportProductLink = React.useCallback(async () => {
    if (!normalizedProductLink) {
      console.log("[PASTE_LINK_UI]", "invalid url", {
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
        console.log("[CLOSET_REVIEW_ERROR]", "missing item id", { item });
        Alert.alert("Review unavailable", "This item is no longer available.");
        return;
      }
      console.log("[CLOSET_REVIEW]", "opening draft review", {
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
      console.log("[ITEM_REMOVE]", "removing unfinished item", {
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
        console.log("[ITEM_REMOVE_SUCCESS]", {
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
        console.log("[ITEM_REMOVE_ERROR]", {
          uid,
          itemId: item.id,
          error,
        });
        Alert.alert("Remove failed", "That item could not be removed. Please try again.");
      }
    },
    [uid]
  );

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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 18,
          paddingBottom: layout.bottomDockPadding + 112,
          gap: 18,
        }}
      >
        <ClosetProcessingSection
          items={processingItems}
          onPressItem={handleReviewProcessingItem}
          onRetry={(item) => void handleRetryProcessingItem(item)}
          onRemove={(item) => void handleRemoveProcessingItem(item)}
        />

        {loading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : sections.length === 0 ? (
          <View
            style={{
              borderRadius: layout.mediumRadius,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: layout.cardPadding,
              gap: 10,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>
              {visibleItems.length === 0 ? "Your closet is still empty" : "No pieces match these filters"}
            </Text>
            <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
              {visibleItems.length === 0
                ? "Add a few pieces and Closet becomes your clean, category-first browser."
                : "Try a broader search or clear one of the active filters."}
            </Text>
          </View>
        ) : (
          sections.map((section) => (
            <ClosetCategorySection
              key={section.key}
              title={section.title}
              count={section.itemCount}
              expanded={expandedSections[section.key] !== false}
              subcategories={section.subcategories}
              onToggle={() =>
                {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setExpandedSections((prev) => ({
                    ...prev,
                    [section.key]: !(prev[section.key] !== false),
                  }));
                }
              }
              onPressItem={handleItemPress}
              onLongPressItem={handleItemLongPress}
              selectedItemIds={selectedItemIds}
            />
          ))
        )}
      </ScrollView>

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
        onClear={() => {
          setSortMode("RECENTLY_ADDED");
          setStatusFilter("ALL");
          setCategoryFilter("ALL");
          setBrandFilter("ALL");
          setColorFilter("ALL");
        }}
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
