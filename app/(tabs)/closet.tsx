import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  ScrollView,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc, updateDoc, writeBatch } from "firebase/firestore";

import {
  ClosetFilterSheet,
  type ClosetColorFilterOption,
  type ClosetFilterOption,
} from "@/src/components/closet/ClosetFilterSheet";
import { ClosetHeader } from "@/src/components/closet/ClosetHeader";
import { ClosetInventoryHeader, type ClosetInventoryCategoryTab } from "@/src/components/closet/ClosetInventoryHeader";
import { ClosetItemCard } from "@/src/components/closet/ClosetItemCard";
import MinimumClosetProgressCard from "@/src/components/closet/MinimumClosetProgressCard";
import { ClosetProcessingSection } from "@/src/components/closet/ClosetProcessingSection";
import { ClosetSearchBar } from "@/src/components/closet/ClosetSearchBar";
import AppImage from "@/src/components/common/AppImage";
import AuraPressable from "@/src/components/aura/AuraPressable";
import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraCardStyle,
  auraChipStyle,
  auraChipTextStyle,
  auraSheetBackdropStyle,
  auraSurfaceTiers,
  AuraSheetBackdrop,
  AuraSheetSurface,
  AuraTopSafeAreaScrim,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { AuraSkeleton, AuraSkeletonLine } from "@/src/components/ui/AuraSkeleton";
import type { ChatImageAttachment } from "@/src/components/ai/chatTypes";
import {
  type CategoryKey,
  type ClosetListRow,
  type ClosetSection,
  buildClosetListRows,
  buildSections,
  normalizeText,
  rankSearchItems,
  sortItems,
  type SortMode,
  toMillis,
  validHttpUrl,
} from "@/src/closet/closetListModel";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { FLOATING_CONTROL_GAP } from "@/src/constants/dock";
import { db } from "@/src/lib/firebase";
import { deleteWardrobeItem } from "@/src/lib/deleteItem";
import {
  createAuraItemDraftsFromCandidates,
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
} from "@/src/lib/minimumCloset";
import { getStyleProfileConfig } from "@/src/lib/styleProfile";
import { Toast } from "@/src/lib/toast";
import { loadUserProfilePreferences } from "@/src/lib/userProfile";
import { getCachedProfilePreferences } from "@/src/lib/localCache";
import {
  ClosetProductLinkError,
  candidateFromProductLinkDraft,
  draftFromProductLinkPreview,
  previewProductLinkForCloset,
  type ClosetProductLinkDraft,
  type ClosetProductLinkPreview,
} from "@/src/lib/productLinkClosetImport";
import { formatUrlForDisplay } from "@/src/lib/formatChatText";
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

const INVENTORY_CATEGORY_TABS: ClosetInventoryCategoryTab[] = [
  { key: "ALL", label: "All" },
  { key: "top", label: "Tops" },
  { key: "bottom", label: "Bottoms" },
  { key: "outerwear", label: "Outerwear" },
  { key: "shoes", label: "Shoes" },
  { key: "accessory", label: "Accessories" },
  { key: "one_piece", label: "Dresses" },
];

const PRODUCT_LINK_CATEGORY_OPTIONS = [
  { key: "top", label: "Tops" },
  { key: "bottom", label: "Bottoms" },
  { key: "outerwear", label: "Outerwear" },
  { key: "shoes", label: "Footwear" },
  { key: "accessory", label: "Accessories" },
  { key: "one_piece", label: "Dresses" },
] as const;

const MULTICOLOR_FILTER_KEY = "__multicolor__";
const STYLE_FILTER_OPTIONS: ClosetFilterOption[] = [
  { key: "relaxed", label: "Relaxed" },
  { key: "slim", label: "Slim" },
  { key: "oversized", label: "Oversized" },
  { key: "formal", label: "Formal" },
  { key: "casual", label: "Casual" },
];
const WEAR_FILTER_OPTIONS: ClosetFilterOption[] = [
  { key: "never_worn", label: "Never worn" },
  { key: "recently_worn", label: "Recently worn" },
  { key: "unworn_for_a_while", label: "Unworn for a while" },
];
const RECENTLY_WORN_MS = 14 * 24 * 60 * 60 * 1000;
const UNWORN_FOR_A_WHILE_MS = 45 * 24 * 60 * 60 * 1000;
const PROCESSING_STALE_TIMEOUT_MS = 15 * 60 * 1000;
const SEARCH_PREVIEW_LIMIT = 8;
const CLOSET_FAB_SIZE = 66;
const CLOSET_FAB_DOCK_GAP = 22;
const DEBUG_CLOSET_CLIENT = __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";
function debugClosetLog(...args: Parameters<typeof console.log>) {
  if (DEBUG_CLOSET_CLIENT) {
    console.log(...args);
  }
}

const closetRowKeyExtractor = (row: ClosetListRow) => row.key;

function normalizeFilterToken(value: unknown) {
  return sanitizeDisplayText(String(value ?? ""))
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseFilterLabel(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanProductLinkText(value: unknown) {
  return sanitizeDisplayText(String(value ?? ""));
}

function productLinkCategoryLabel(value?: string | null) {
  const normalized = cleanProductLinkText(value).toLowerCase().replace(/[_-]+/g, " ");
  const option = PRODUCT_LINK_CATEGORY_OPTIONS.find(
    (candidate) => candidate.key === value || candidate.key.replace("_", " ") === normalized
  );
  return option?.label ?? (normalized ? titleCaseFilterLabel(normalized) : "Category");
}

function productLinkPreviewImageUrl(preview: ClosetProductLinkPreview | null) {
  if (!preview) return "";
  return (
    cleanProductLinkText(preview.candidate.primaryImageUrl) ||
    cleanProductLinkText(preview.candidate.imageUrls?.[0]) ||
    cleanProductLinkText(preview.candidate.secondaryImageUrls?.[0])
  );
}

function productLinkPriceLabel(preview: ClosetProductLinkPreview | null) {
  if (!preview) return "";
  return (
    cleanProductLinkText(preview.metadata.priceDisplay) ||
    cleanProductLinkText(preview.metadata.price) ||
    cleanProductLinkText(preview.candidate.priceDisplay)
  );
}

function productLinkSourceLabel(preview: ClosetProductLinkPreview | null) {
  if (!preview) return "";
  return cleanProductLinkText(preview.metadata.domain) || cleanProductLinkText(preview.metadata.retailer);
}

type ProductLinkRecoverableError = {
  code: string;
  title: string;
  message: string;
};

function arrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function itemColorValues(item: ClosetItem) {
  const extended = item as ClosetItem & Record<string, unknown>;
  return [
    item.primaryColor,
    item.colorLabel,
    item.displayColor,
    ...(item.colors ?? []),
    ...(item.displayColors ?? []),
    ...arrayFromUnknown(extended.aiColors),
  ].filter(Boolean);
}

function itemColorKeys(item: ClosetItem) {
  return Array.from(new Set(itemColorValues(item).map(normalizeFilterToken).filter(Boolean)));
}

function itemHasMultipleColors(item: ClosetItem) {
  const explicitColors = [
    ...(item.colors ?? []),
    ...(item.displayColors ?? []),
  ].map(normalizeFilterToken).filter(Boolean);
  if (new Set(explicitColors).size > 1) return true;
  return itemColorValues(item).some((value) => normalizeFilterToken(value).includes("multi"));
}

function itemStyleTokens(item: ClosetItem) {
  const extended = item as ClosetItem & Record<string, unknown>;
  return new Set(
    [
      item.fit,
      item.style,
      item.formality,
      ...(item.aestheticTags ?? []),
      ...(item.occasionTags ?? []),
      ...(item.detailTags ?? []),
      ...arrayFromUnknown(extended.styleTags),
    ].map(normalizeFilterToken).filter(Boolean),
  );
}

function itemMatchesStyleFilter(item: ClosetItem, filter: string) {
  const tokens = itemStyleTokens(item);
  if (tokens.has(filter)) return true;
  return Array.from(tokens).some((token) => token.includes(filter));
}

function itemLastWornMillis(item: ClosetItem) {
  return toMillis(item.lastWornAt) || toMillis(item.lastWornDate);
}

function itemMatchesWearFilter(item: ClosetItem, filter: string) {
  const lastWorn = itemLastWornMillis(item);
  const now = Date.now();
  if (filter === "never_worn") return !lastWorn;
  if (filter === "recently_worn") return !!lastWorn && now - lastWorn <= RECENTLY_WORN_MS;
  if (filter === "unworn_for_a_while") return !!lastWorn && now - lastWorn >= UNWORN_FOR_A_WHILE_MS;
  return false;
}

function toggleFilterValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((current) => current !== value)
    : [...values, value];
}

const ClosetListSeparator = React.memo(function ClosetListSeparator() {
  return <View style={{ height: 22 }} />;
});

function buildGridRows(items: ClosetItem[], keyPrefix: string) {
  const rows: ClosetListRow[] = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push({
      type: "items",
      key: `${keyPrefix}:row:${index}`,
      items: items.slice(index, index + 2),
      animateOffset: index,
    });
  }
  return rows;
}

function appendAddTileToRows(rows: ClosetListRow[], animateOffset: number) {
  let lastItemsIndex = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index]?.type === "items") {
      lastItemsIndex = index;
      break;
    }
  }
  if (lastItemsIndex < 0) {
    return rows;
  }
  const next = [...rows];
  const lastItemsRow = next[lastItemsIndex];
  if (lastItemsRow.type !== "items") return next;
  if (lastItemsRow.items.length < 2) {
    next[lastItemsIndex] = { ...lastItemsRow, trailingAddTile: true };
    return next;
  }
  next.push({
    type: "items",
    key: "closet:add-item-row",
    items: [],
    animateOffset,
    trailingAddTile: true,
  });
  return next;
}

const ClosetSearchResultsHeader = React.memo(function ClosetSearchResultsHeader({
  query,
  totalCount,
  shownCount,
  onViewAll,
}: {
  query: string;
  totalCount: number;
  shownCount: number;
  onViewAll: () => void;
}) {
  const { colors } = useAppTheme();
  const hasMore = totalCount > shownCount;

  return (
    <View style={{ marginBottom: 12, gap: 8 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, fontWeight: "600" }}>
        Showing {shownCount} of {totalCount} result{totalCount === 1 ? "" : "s"} for {query.trim()}.
      </Text>
      {hasMore ? (
        <AuraPressable
          onPress={onViewAll}
          haptic="selection"
          hapticTrigger="press"
          pressedScale={0.97}
          style={{
            alignSelf: "flex-start",
            ...auraButtonStyle(colors, "tertiary"),
            minHeight: 40,
            borderRadius: 999,
            paddingHorizontal: 12,
          }}
        >
          <Text style={[auraButtonTextStyle(colors, "tertiary"), { fontSize: 12, lineHeight: 16 }]}>
            View all related items
          </Text>
        </AuraPressable>
      ) : null}
    </View>
  );
});

const ClosetSearchEmptyState = React.memo(function ClosetSearchEmptyState() {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <View
      style={{
        borderRadius: layout.largeRadius,
        ...auraSurfaceTiers.surfaceBase,
        padding: layout.cardPadding + 2,
        gap: 10,
      }}
    >
      <Text style={[auraTypography.sectionTitle, { color: colors.text }]}>
        No exact match
      </Text>
      <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
        Try a broader search.
      </Text>
    </View>
  );
});

const ClosetLoadingSkeleton = React.memo(function ClosetLoadingSkeleton() {
  const layout = useResponsiveLayout();

  return (
    <View style={{ gap: 18, paddingTop: 10 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <AuraSkeleton height={218} radius={layout.mediumRadius} style={{ flex: 1 }} />
        <AuraSkeleton height={218} radius={layout.mediumRadius} style={{ flex: 1 }} />
      </View>
      <AuraSkeletonLine width="44%" height={14} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <AuraSkeleton height={218} radius={layout.mediumRadius} style={{ flex: 1 }} />
        <AuraSkeleton height={218} radius={layout.mediumRadius} style={{ flex: 1 }} />
      </View>
    </View>
  );
});

const ClosetEmptyState = React.memo(function ClosetEmptyState({
  filtered,
  onAddItem,
  onClearFilters,
}: {
  filtered: boolean;
  onAddItem: () => void;
  onClearFilters: () => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  return (
    <View
      style={{
        borderRadius: layout.largeRadius,
        ...auraSurfaceTiers.surfaceBase,
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
        <Text style={[auraTypography.sectionTitle, { color: colors.text }]}>
          {filtered ? "No pieces match" : "Start your closet"}
        </Text>
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
          {filtered
            ? "Clear the filters to return to your full wardrobe."
            : "Add a few clean photos so AURA can build from what you own."}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <AuraPressable
          onPress={filtered ? onClearFilters : onAddItem}
          haptic="selection"
          hapticTrigger="press"
          pressedScale={0.97}
          style={{
            ...auraButtonStyle(colors, "primary"),
            minHeight: 40,
            borderRadius: 999,
            paddingHorizontal: 14,
          }}
        >
          <Text style={[auraButtonTextStyle(colors, "primary"), { fontSize: 13, lineHeight: 17 }]}>
            {filtered ? "Clear filters" : "Add item"}
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
    <View style={{ gap: 10, paddingTop: 6 }}>
      <View style={{ height: 1, backgroundColor: "rgba(251,228,216,0.07)" }} />
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
          paddingVertical: 2,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "600", letterSpacing: 0 }}>
            {section.title}
          </Text>
          <View
            style={{
              paddingHorizontal: 7,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: "rgba(251,228,216,0.06)",
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
              {section.itemCount}
            </Text>
          </View>
        </View>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(251,228,216,0.05)",
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
    <View style={{ gap: 8, paddingTop: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13.5, lineHeight: 18, fontWeight: "600", letterSpacing: 0 }}>
          {label}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontWeight: "600", opacity: 0.86, fontVariant: ["tabular-nums"] }}>
          {count}
        </Text>
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: colors.border,
          opacity: 0.38,
          marginRight: layout.horizontalPadding * 0.2,
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
  trailingAddTile?: boolean;
  selectedItemIds: Set<string>;
  onAddItem: () => void;
  onPressItem: (item: ClosetItem) => void;
  onLongPressItem: (item: ClosetItem) => void;
};

const ClosetAddItemTile = React.memo(function ClosetAddItemTile({
  width,
  onPress,
}: {
  width: number;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const boardSize = width;
  const textBlockHeight = 60;

  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.97}
      pressedOpacity={0.9}
      style={{
        width,
        minHeight: boardSize + textBlockHeight,
        borderRadius: 22,
        overflow: "visible",
        backgroundColor: "transparent",
      }}
    >
      <View
        style={{
          width: boardSize,
          height: boardSize,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(251,228,216,0.055)",
          borderWidth: 1,
          borderColor: "rgba(251,228,216,0.09)",
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(223,182,178,0.16)",
            borderWidth: 1,
            borderColor: "rgba(223,182,178,0.22)",
          }}
        >
          <Ionicons name="add" size={25} color={colors.ctaCream} />
        </View>
      </View>
      <View
        style={{
          height: textBlockHeight,
          paddingHorizontal: 2,
          paddingTop: 9,
          paddingBottom: 5,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 12.25, lineHeight: 16, fontWeight: "600" }} numberOfLines={1}>
          Add item
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: 10.5, lineHeight: 15, fontWeight: "600", opacity: 0.66, marginTop: 4 }}
          numberOfLines={1}
        >
          Quick capture
        </Text>
      </View>
    </AuraPressable>
  );
});

const ClosetGridRow = React.memo(
  function ClosetGridRow({
    items,
    cardWidth,
    gridGap,
    animateOffset,
    trailingAddTile = false,
    selectedItemIds,
    onAddItem,
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
        {trailingAddTile ? (
          <ClosetAddItemTile width={cardWidth} onPress={onAddItem} />
        ) : null}
      </View>
    );
  },
  (prev, next) =>
    prev.items === next.items &&
    prev.cardWidth === next.cardWidth &&
    prev.gridGap === next.gridGap &&
    prev.animateOffset === next.animateOffset &&
    prev.trailingAddTile === next.trailingAddTile &&
    prev.onAddItem === next.onAddItem &&
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
  const [showAllSearchResults, setShowAllSearchResults] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("RECENTLY_ADDED");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ClothingStatus>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | CategoryKey>("ALL");
  const [brandFilter, setBrandFilter] = useState<string>("ALL");
  const [colorFilters, setColorFilters] = useState<string[]>([]);
  const [styleFilters, setStyleFilters] = useState<string[]>([]);
  const [wearFilters, setWearFilters] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [styleInsightsExpanded, setStyleInsightsExpanded] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [productLink, setProductLink] = useState("");
  const [productLinkTouched, setProductLinkTouched] = useState(false);
  const [productLinkLoading, setProductLinkLoading] = useState(false);
  const [productLinkSaving, setProductLinkSaving] = useState(false);
  const [productLinkError, setProductLinkError] = useState("");
  const [productLinkRecoverableError, setProductLinkRecoverableError] =
    useState<ProductLinkRecoverableError | null>(null);
  const [productLinkPreview, setProductLinkPreview] = useState<ClosetProductLinkPreview | null>(null);
  const [productLinkDraft, setProductLinkDraft] = useState<ClosetProductLinkDraft | null>(null);
  const [productLinkEditing, setProductLinkEditing] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  const handleRefresh = React.useCallback(async () => {
    if (!uid || refreshing) return;
    setRefreshing(true);
    const startedAt = Date.now();
    try {
      const profile = await loadUserProfilePreferences(uid);
      setProfilePreferences(profile);
    } catch {
      setProfilePreferences(null);
    } finally {
      const remaining = Math.max(0, 450 - (Date.now() - startedAt));
      setTimeout(() => setRefreshing(false), remaining);
    }
  }, [refreshing, uid]);

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
  const normalizedSearch = useMemo(() => normalizeText(search), [search]);
  const isSearchMode = normalizedSearch.length > 0;
  const showMinimumClosetCard = !loading && !minimumClosetProgress.isUnlocked && !isSearchMode;

  useEffect(() => {
    setShowAllSearchResults(false);
  }, [normalizedSearch]);

  const openAddMissingItem = React.useCallback(() => {
    const suggestedCategory = getSuggestedAddItemCategory(visibleItems);
    router.push({
      pathname: "/(tabs)/add",
      params: {
        ...(suggestedCategory ? { suggestedCategory } : {}),
        addSession: String(Date.now()),
        sourceRoute: "/(tabs)/closet",
        sourceTab: "closet",
      },
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
  const productLinkChipLabel = useMemo(
    () => (normalizedProductLink ? formatUrlForDisplay(normalizedProductLink) : ""),
    [normalizedProductLink],
  );
  const productLinkBusy = productLinkLoading || productLinkSaving;
  const productLinkImageUrl = useMemo(
    () => productLinkPreviewImageUrl(productLinkPreview),
    [productLinkPreview],
  );
  const productLinkPrice = useMemo(
    () => productLinkPriceLabel(productLinkPreview),
    [productLinkPreview],
  );
  const productLinkSource = useMemo(
    () => productLinkSourceLabel(productLinkPreview),
    [productLinkPreview],
  );
  const productLinkMaterial = useMemo(
    () =>
      cleanProductLinkText(productLinkPreview?.candidate.material) ||
      cleanProductLinkText(productLinkPreview?.metadata.material),
    [productLinkPreview],
  );
  const productLinkFit = useMemo(
    () => cleanProductLinkText(productLinkPreview?.candidate.fit),
    [productLinkPreview],
  );
  const productLinkCanSave =
    !!uid &&
    !!productLinkPreview &&
    !!productLinkDraft &&
    !!cleanProductLinkText(productLinkDraft.name);

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

  const colorOptions = useMemo<ClosetColorFilterOption[]>(() => {
    const options = new Map<string, string>();
    visibleItems.forEach((item) => {
      itemColorValues(item).forEach((value) => {
        const key = normalizeFilterToken(value);
        if (!key || key === "multicolor" || key === "multi color") return;
        if (!options.has(key)) {
          options.set(key, titleCaseFilterLabel(key));
        }
      });
    });
    return Array.from(options.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleItems]);

  const styleFilterOptions = useMemo(
    () =>
      STYLE_FILTER_OPTIONS.filter((option) =>
        visibleItems.some((item) => itemMatchesStyleFilter(item, option.key))
      ),
    [visibleItems],
  );

  const wearFilterOptions = useMemo(
    () =>
      WEAR_FILTER_OPTIONS.filter((option) =>
        visibleItems.some((item) => itemMatchesWearFilter(item, option.key))
      ),
    [visibleItems],
  );

  useEffect(() => {
    const availableColors = new Set([MULTICOLOR_FILTER_KEY, ...colorOptions.map((option) => option.key)]);
    setColorFilters((prev) => prev.filter((value) => availableColors.has(value)));
  }, [colorOptions]);

  useEffect(() => {
    const availableStyles = new Set(styleFilterOptions.map((option) => option.key));
    setStyleFilters((prev) => prev.filter((value) => availableStyles.has(value)));
  }, [styleFilterOptions]);

  useEffect(() => {
    const availableWear = new Set(wearFilterOptions.map((option) => option.key));
    setWearFilters((prev) => prev.filter((value) => availableWear.has(value)));
  }, [wearFilterOptions]);

  const toggleColorFilter = React.useCallback((value: string) => {
    setColorFilters((prev) => toggleFilterValue(prev, value));
  }, []);

  const toggleStyleFilter = React.useCallback((value: string) => {
    setStyleFilters((prev) => toggleFilterValue(prev, value));
  }, []);

  const toggleWearFilter = React.useCallback((value: string) => {
    setWearFilters((prev) => toggleFilterValue(prev, value));
  }, []);

  const filteredByControls = useMemo(
    () =>
      visibleItems.filter((item) => {
        if (statusFilter !== "ALL") {
          const laundryStatus = normalizeLaundryStatus(item);
          if (statusFilter === "AVAILABLE" && laundryStatus !== "clean") return false;
          if (statusFilter === "WORN" && laundryStatus !== "needs_wash") return false;
          if (statusFilter === "IN_LAUNDRY" && laundryStatus !== "in_laundry") return false;
        }
        if (categoryFilter !== "ALL" && toCanonicalCategory(item.category) !== categoryFilter) return false;
        if (brandFilter !== "ALL" && sanitizeDisplayText(item.brand) !== brandFilter) return false;
        if (colorFilters.length) {
          const colorsForItem = itemColorKeys(item);
          const matchesColor = colorFilters.some((filter) =>
            filter === MULTICOLOR_FILTER_KEY
              ? itemHasMultipleColors(item)
              : colorsForItem.includes(filter)
          );
          if (!matchesColor) return false;
        }
        if (styleFilters.length && !styleFilters.some((filter) => itemMatchesStyleFilter(item, filter))) {
          return false;
        }
        if (wearFilters.length && !wearFilters.some((filter) => itemMatchesWearFilter(item, filter))) {
          return false;
        }
        return true;
      }),
    [brandFilter, categoryFilter, colorFilters, statusFilter, styleFilters, visibleItems, wearFilters],
  );
  const sortedFilteredItems = useMemo(
    () => sortItems(filteredByControls, sortMode),
    [filteredByControls, sortMode],
  );
  const searchResults = useMemo(
    () => (isSearchMode ? rankSearchItems(sortedFilteredItems, normalizedSearch) : []),
    [isSearchMode, normalizedSearch, sortedFilteredItems],
  );
  const displayedSearchItems = useMemo(
    () => (showAllSearchResults ? searchResults : searchResults.slice(0, SEARCH_PREVIEW_LIMIT)),
    [searchResults, showAllSearchResults],
  );

  const sections = useMemo(
    () => buildSections(sortedFilteredItems, categoryOrder, styleProfile.emphasizedSubcategories),
    [categoryOrder, sortedFilteredItems, styleProfile.emphasizedSubcategories]
  );
  const searchRows = useMemo(
    () => (loading || displayedSearchItems.length === 0 ? [] : buildGridRows(displayedSearchItems, "search")),
    [displayedSearchItems, loading],
  );
  const closetRows = useMemo(
    () => {
      if (isSearchMode) return searchRows;
      if (loading || sections.length === 0) return [];
      if (categoryFilter === "ALL") {
        return appendAddTileToRows(buildGridRows(sortedFilteredItems, "all"), sortedFilteredItems.length);
      }
      return appendAddTileToRows(buildClosetListRows(sections, expandedSections), sortedFilteredItems.length);
    },
    [categoryFilter, expandedSections, isSearchMode, loading, searchRows, sections, sortedFilteredItems],
  );
  const activeListItems = isSearchMode ? displayedSearchItems : sortedFilteredItems;
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
    activeListItems.length > 0 && activeListItems.every((item) => selectedItemIds.has(item.id));
  const hasActiveOrganizeState =
    sortMode !== "RECENTLY_ADDED" ||
    statusFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    brandFilter !== "ALL" ||
    colorFilters.length > 0 ||
    styleFilters.length > 0 ||
    wearFilters.length > 0;
  const closetGridGap = 16;
  const closetGridCardWidth =
    (layout.width - layout.horizontalPadding * 2 - closetGridGap) / 2;
  const closetFabRight = Math.max(18, layout.horizontalPadding);
  const closetFabBottom =
    layout.composerOffset + Math.max(0, CLOSET_FAB_DOCK_GAP - FLOATING_CONTROL_GAP);

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
        params: { id: item.id, sourceTab: "closet", sourceRoute: "/(tabs)/closet" },
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

  const openQuickAdd = React.useCallback(() => {
    setQuickAddOpen(true);
  }, []);

  const openManualAddFromCloset = React.useCallback(() => {
    setQuickAddOpen(false);
    router.push({
      pathname: "/(tabs)/add",
      params: { addSession: String(Date.now()), sourceRoute: "/(tabs)/closet", sourceTab: "closet" },
    });
  }, []);

  const openFilters = React.useCallback(() => {
    setFiltersOpen(true);
  }, []);

  const handleChangeSort = React.useCallback((value: string) => {
    setSortMode(value as SortMode);
  }, []);

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
    setSelectedItemIds(new Set(activeListItems.map((item) => item.id)));
  }, [activeListItems, allFilteredItemsSelected, clearSelection]);

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
                selectedItems.map((item) => deleteWardrobeItem(uid, item.id, item))
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
      const title = selectedItems.length === 1 ? "AURA item" : "AURA selection";
      const message =
        selectedItems.length === 1
          ? `${sanitizeDisplayText(selectedItems[0]?.name) || "Wardrobe item"}`
          : `AURA selection (${selectedItems.length} items): ${selectedItems
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

  const resetProductLinkSheet = React.useCallback(() => {
    setProductLink("");
    setProductLinkTouched(false);
    setProductLinkError("");
    setProductLinkRecoverableError(null);
    setProductLinkPreview(null);
    setProductLinkDraft(null);
    setProductLinkEditing(false);
  }, []);

  const closeProductLinkSheet = React.useCallback(() => {
    if (productLinkBusy) return;
    setLinkModalOpen(false);
    resetProductLinkSheet();
  }, [productLinkBusy, resetProductLinkSheet]);

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
    setProductLinkLoading(true);
    setProductLinkError("");
    setProductLinkRecoverableError(null);
    setProductLinkPreview(null);
    setProductLinkDraft(null);
    setProductLinkEditing(false);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      const preview = await previewProductLinkForCloset(url);
      setProductLinkPreview(preview);
      setProductLinkDraft(draftFromProductLinkPreview(preview));
      setProductLinkTouched(false);
      setQuickAddOpen(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      if (error instanceof ClosetProductLinkError && error.blockedStore) {
        setProductLinkRecoverableError({
          code: "blocked_store",
          title: "This store blocked automatic reading.",
          message: "You can try again, paste another link, or add the item from a screenshot.",
        });
      } else {
        setProductLinkError(
          error?.message ?? "I could not read that product link. Try another product page or add it manually."
        );
      }
    } finally {
      setProductLinkLoading(false);
    }
  }, [uid]);

  const handlePasteProductLinkAction = React.useCallback(() => {
    debugClosetLog("[PASTE_LINK_UI]", "opened", { uid });
    resetProductLinkSheet();
    setQuickAddOpen(false);
    setLinkModalOpen(true);
  }, [resetProductLinkSheet, uid]);

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
      setProductLinkError("");
      setProductLinkRecoverableError(null);
      setProductLinkPreview(null);
      setProductLinkDraft(null);
      setProductLinkEditing(false);
    } catch (error) {
      debugClosetLog("[PASTE_LINK_UI]", "pasted from clipboard", {
        uid,
        hasClipboardText: false,
        hasValidUrl: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }, [uid]);

  const handleAddProductLinkFromScreenshot = React.useCallback(async () => {
    if (productLinkBusy) return;
    setLinkModalOpen(false);
    await handleChoosePhotos();
  }, [handleChoosePhotos, productLinkBusy]);

  const handleOpenProductLinkManually = React.useCallback(async () => {
    const url = normalizedProductLink ?? validHttpUrl(productLink);
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      Toast.error("Could not open link", "Open the product page in your browser and add from screenshot/photo.");
    }
  }, [normalizedProductLink, productLink]);

  const handleImportProductLink = React.useCallback(async () => {
    if (productLinkBusy) return;
    if (!normalizedProductLink) {
      debugClosetLog("[PASTE_LINK_UI]", "invalid url", {
        uid,
        rawUrl: productLink,
      });
      setProductLinkTouched(true);
      return;
    }
    await startProductLinkReview(productLink, "manual");
  }, [normalizedProductLink, productLink, productLinkBusy, startProductLinkReview, uid]);

  const handleSaveProductLinkToCloset = React.useCallback(async () => {
    if (!uid || !productLinkPreview || !productLinkDraft || productLinkSaving) return;
    setProductLinkSaving(true);
    setProductLinkError("");
    setProductLinkRecoverableError(null);
    try {
      const candidate = candidateFromProductLinkDraft({
        preview: productLinkPreview,
        draft: productLinkDraft,
      });
      await createAuraItemDraftsFromCandidates({
        uid,
        candidates: [candidate],
        prompt: "Closet product link import",
        mode: "pending",
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setLinkModalOpen(false);
      resetProductLinkSheet();
      Toast.itemAdded();
    } catch (error: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setProductLinkError(
        error?.message ?? "That item could not be added yet. You can edit the details or try another link."
      );
    } finally {
      setProductLinkSaving(false);
    }
  }, [productLinkDraft, productLinkPreview, productLinkSaving, resetProductLinkSheet, uid]);

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
        params: { editId: item.id, sourceItemId: item.id, sourceRoute: "/(tabs)/closet", sourceTab: "closet" },
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
        await deleteWardrobeItem(uid, item.id, item);
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
          trailingAddTile={item.trailingAddTile}
          selectedItemIds={selectedItemIds}
          onAddItem={openQuickAdd}
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
      openQuickAdd,
      selectedItemIds,
    ],
  );

  const closetListHeader = useMemo(() => {
    if (isSearchMode) {
      if (!searchResults.length) return null;
      return (
        <ClosetSearchResultsHeader
          query={search}
          totalCount={searchResults.length}
          shownCount={displayedSearchItems.length}
          onViewAll={() => setShowAllSearchResults(true)}
        />
      );
    }

    return null;
  }, [
    displayedSearchItems.length,
    isSearchMode,
    search,
    searchResults.length,
  ]);

  const closetListFooter = useMemo(() => {
    if (isSearchMode) return null;
    if (!processingItems.length && !showMinimumClosetCard) return null;
    return (
      <View style={{ gap: 18, marginTop: 22 }}>
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
            expanded={styleInsightsExpanded}
            onToggleExpanded={() => setStyleInsightsExpanded((expanded) => !expanded)}
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
    isSearchMode,
    openAddMissingItem,
    processingItems,
    showMinimumClosetCard,
    styleInsightsExpanded,
    visibleItems,
  ]);

  const clearFilters = React.useCallback(() => {
    setSearch("");
    setStatusFilter("ALL");
    setCategoryFilter("ALL");
    setBrandFilter("ALL");
    setColorFilters([]);
    setStyleFilters([]);
    setWearFilters([]);
  }, []);

  const closetListEmpty = useMemo(() => {
    if (loading) {
      return <ClosetLoadingSkeleton />;
    }

    if (isSearchMode) {
      return <ClosetSearchEmptyState />;
    }

    return (
      <ClosetEmptyState
        filtered={visibleItems.length > 0}
        onAddItem={openQuickAdd}
        onClearFilters={clearFilters}
      />
    );
  }, [clearFilters, isSearchMode, loading, openQuickAdd, visibleItems.length]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AuraTopSafeAreaScrim color={colors.background} />
      <View
        style={{
          paddingTop: layout.topContentInset,
          paddingHorizontal: layout.horizontalPadding,
          paddingBottom: 4,
          backgroundColor: colors.background,
          borderBottomWidth: 0,
          borderBottomColor: "transparent",
          gap: 0,
          zIndex: 20,
          elevation: 8,
        }}
      >
        <ClosetHeader
          totalCount={visibleItems.length}
          onOpenOrganize={openFilters}
          hasActiveOrganizeState={hasActiveOrganizeState}
        />

        {isSelectionMode ? (
          <View
            style={{
              gap: 12,
              padding: 12,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceBase,
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
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
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
                  minHeight: 44,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.surfaceInteractive,
                  opacity: bulkActionLoading ? 0.5 : pressed ? 0.78 : 1,
                })}
              >
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
                  {allFilteredItemsSelected ? "Clear" : "Select all"}
                </Text>
              </Pressable>
              <Pressable
                onPress={clearSelection}
                disabled={bulkActionLoading}
                style={({ pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.overlay,
                  opacity: bulkActionLoading ? 0.5 : pressed ? 0.78 : 1,
                })}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
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

        <View style={{ gap: 10, marginTop: 9 }}>
          <ClosetSearchBar value={search} onChangeText={setSearch} />

          <ClosetInventoryHeader
            activeCategory={categoryFilter}
            categoryTabs={INVENTORY_CATEGORY_TABS}
            onSelectCategory={setCategoryFilter}
          />
        </View>
      </View>

      <FlatList
        data={closetRows}
        keyExtractor={closetRowKeyExtractor}
        renderItem={renderClosetRow}
        ListHeaderComponent={closetListHeader}
        ListFooterComponent={closetListFooter}
        ListEmptyComponent={closetListEmpty}
        ItemSeparatorComponent={ClosetListSeparator}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.ctaCream}
            colors={[colors.ctaCream]}
            progressBackgroundColor={colors.background}
          />
        }
        removeClippedSubviews={Platform.OS !== "web"}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        extraData={selectedItemIds}
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 16,
          paddingBottom: layout.bottomDockPadding + 56,
        }}
      />

      <AuraPressable
        onPress={openQuickAdd}
        haptic="selection"
        hapticTrigger="press"
        pressedScale={0.975}
        pressedOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Add item"
        style={{
          position: "absolute",
          right: closetFabRight,
          bottom: closetFabBottom,
          width: CLOSET_FAB_SIZE,
          height: CLOSET_FAB_SIZE,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(223,182,178,0.96)",
          borderWidth: 1,
          borderColor: "rgba(251,228,216,0.36)",
          boxShadow: "0 14px 32px rgba(223,182,178,0.26)",
          zIndex: 25,
        }}
      >
        <Ionicons name="add" size={32} color={colors.ctaText} />
      </AuraPressable>

      <ClosetFilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
        brandFilter={brandFilter}
        colorFilters={colorFilters}
        sortMode={sortMode}
        sortOptions={SORT_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        categoryOptions={[
          { key: "ALL", label: "All categories" },
          { key: "top", label: "Tops" },
          { key: "bottom", label: "Bottoms" },
          { key: "outerwear", label: "Outerwear" },
          { key: "shoes", label: "Footwear" },
          { key: "accessory", label: "Accessories" },
          { key: "one_piece", label: "One-pieces" },
        ]}
        brandOptions={brandOptions}
        colorOptions={colorOptions}
        multicolorFilterKey={MULTICOLOR_FILTER_KEY}
        styleOptions={styleFilterOptions}
        selectedStyleFilters={styleFilters}
        wearOptions={wearFilterOptions}
        selectedWearFilters={wearFilters}
        onChangeStatus={(value) => setStatusFilter(value as "ALL" | ClothingStatus)}
        onChangeCategory={(value) => setCategoryFilter(value as "ALL" | CategoryKey)}
        onChangeBrand={setBrandFilter}
        onChangeSort={handleChangeSort}
        onToggleColor={toggleColorFilter}
        onClearColors={() => setColorFilters([])}
        onToggleStyle={toggleStyleFilter}
        onClearStyle={() => setStyleFilters([])}
        onToggleWear={toggleWearFilter}
        onClearWear={() => setWearFilters([])}
        onClear={clearFilters}
      />

      <Modal
        visible={moreActionsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMoreActionsOpen(false)}
      >
        <Pressable
          onPress={() => setMoreActionsOpen(false)}
          style={{
            ...auraSheetBackdropStyle(colors),
            justifyContent: "flex-end",
            paddingHorizontal: layout.horizontalPadding,
            paddingBottom: layout.composerOffset + 18,
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              ...auraCardStyle(colors, "sheet"),
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={[auraTypography.cardTitle, { color: colors.text }]}>
              More actions
            </Text>
            <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary, fontSize: 13, lineHeight: 18 }]}>
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
              icon="refresh-outline"
              label="Mark Available"
              disabled={bulkActionLoading}
              onPress={() => void runBulkAction("Mark available", async () => applyBulkStatus("AVAILABLE"))}
            />
            <QuickAddAction
              icon="star-outline"
              label="Favorite"
              disabled={bulkActionLoading}
              onPress={handleBulkFavorite}
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
        <AuraSheetBackdrop
          style={{
            paddingHorizontal: layout.horizontalPadding,
            paddingBottom: Math.max(layout.floatingDockBottom + 12, 20),
          }}
        >
          <Pressable
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
            onPress={() => setQuickAddOpen(false)}
          />
          <AuraSheetSurface
            style={{
              padding: 16,
              gap: 12,
              borderRadius: layout.largeRadius,
              backgroundColor: colors.surfaceElevated,
            }}
          >
            <View
              pointerEvents="none"
              style={{
                alignSelf: "center",
                width: 42,
                height: 4,
                borderRadius: 999,
                backgroundColor: colors.borderStrong,
                marginBottom: 2,
              }}
            />
            <View style={{ gap: 4, paddingBottom: 2 }}>
              <Text style={[auraTypography.cardTitle, { color: colors.text, fontSize: 18 }]}>
                Add item
              </Text>
              <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, fontWeight: "400" }]}>
                Fast capture for your wardrobe.
              </Text>
            </View>
            <QuickAddAction
              icon="camera-outline"
              label="Take Photo"
              disabled={quickAdding}
              onPress={() => {
                setQuickAddOpen(false);
                void handleTakePhoto();
              }}
            />
            <QuickAddAction
              icon="images-outline"
              label="Upload Photo"
              disabled={quickAdding}
              onPress={() => {
                setQuickAddOpen(false);
                void handleChoosePhotos();
              }}
            />
            <QuickAddAction
              icon="link-outline"
              label="Paste Product Link"
              disabled={quickAdding}
              onPress={() => {
                setQuickAddOpen(false);
                handlePasteProductLinkAction();
              }}
            />
            <QuickAddAction
              icon="create-outline"
              label="Manual Add"
              disabled={quickAdding}
              onPress={openManualAddFromCloset}
            />
          </AuraSheetSurface>
        </AuraSheetBackdrop>
      </Modal>

      <Modal
        visible={linkModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeProductLinkSheet}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
          style={{ flex: 1 }}
        >
          <Pressable
            onPress={closeProductLinkSheet}
            style={{
              ...auraSheetBackdropStyle(colors),
              justifyContent: "flex-end",
              paddingHorizontal: layout.horizontalPadding,
              paddingTop: layout.topContentInset,
              paddingBottom: Math.max(layout.floatingDockBottom + 10, 18),
            }}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                maxHeight: layout.height * 0.84,
                ...auraCardStyle(colors, "sheet"),
                padding: 14,
                overflow: "hidden",
              }}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingBottom: 10 }}
              >
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[auraTypography.cardTitle, { color: colors.text, fontSize: 19 }]}>
                    Paste product link
                  </Text>
                  <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary, fontSize: 13, lineHeight: 18 }]}>
                    Paste a product URL and review the item before adding it to your closet.
                  </Text>
                </View>
                <Pressable
                  onPress={closeProductLinkSheet}
                  disabled={productLinkBusy}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.surfaceMuted,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: productLinkBusy ? 0.45 : pressed ? 0.74 : 1,
                  })}
                >
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>

              <View style={{ gap: 8 }}>
                <TextInput
                  value={productLink}
                  onChangeText={(value) => {
                    setProductLink(value);
                    setProductLinkTouched(true);
                    setProductLinkError("");
                    setProductLinkRecoverableError(null);
                    setProductLinkPreview(null);
                    setProductLinkDraft(null);
                    setProductLinkEditing(false);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardAppearance="dark"
                  keyboardType="url"
                  placeholder="https://..."
                  placeholderTextColor={colors.textMuted}
                  editable={!productLinkBusy}
                  onSubmitEditing={() => void handleImportProductLink()}
                  style={{
                    minHeight: 50,
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    color: colors.text,
                    backgroundColor: colors.inputBackground,
                    borderWidth: 1,
                    borderColor: colors.border,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                />
                {productLinkInlineError ? (
                  <Text selectable style={{ color: "#ffb2b2", fontSize: 12, lineHeight: 16, fontWeight: "600" }}>
                    {productLinkInlineError}
                  </Text>
                ) : null}
                {productLinkError ? (
                  <Text selectable style={{ color: "#ffb2b2", fontSize: 12, lineHeight: 16, fontWeight: "600" }}>
                    {productLinkError}
                  </Text>
                ) : null}
                {productLinkChipLabel ? (
                  <View
                    style={{
                      alignSelf: "stretch",
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceMuted,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      flexDirection: "row",
                      gap: 7,
                      alignItems: "center",
                    }}
                  >
                    <Ionicons name="link-outline" size={14} color={colors.textSecondary} />
                    <Text
                      numberOfLines={1}
                      style={{
                        maxWidth: layout.width * 0.58,
                        color: colors.text,
                        fontSize: 12.5,
                        lineHeight: 16,
                        fontWeight: "600",
                      }}
                    >
                      {productLinkChipLabel}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => void handlePasteFromClipboard()}
                  disabled={productLinkBusy}
                  style={({ pressed }) => ({
                    flex: 0.8,
                    ...auraButtonStyle(colors, "secondary", productLinkBusy, "compact"),
                    flexDirection: "row",
                    gap: 8,
                    minHeight: 44,
                    opacity: productLinkBusy ? 0.55 : pressed ? 0.82 : 1,
                  })}
                >
                  <Ionicons name="clipboard-outline" size={17} color={productLinkBusy ? colors.textSecondary : colors.text} />
                  <Text style={[auraButtonTextStyle(colors, "secondary", productLinkBusy), { fontSize: 14 }]}>
                    Paste
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleImportProductLink()}
                  disabled={productLinkBusy || !normalizedProductLink}
                  style={({ pressed }) => ({
                    flex: 1.2,
                    ...auraButtonStyle(colors, "primary", productLinkBusy || !normalizedProductLink, "compact"),
                    flexDirection: "row",
                    gap: 8,
                    minHeight: 44,
                    opacity: productLinkBusy || !normalizedProductLink ? 0.55 : pressed ? 0.86 : 1,
                  })}
                >
                  {productLinkLoading ? <ActivityIndicator size="small" color={colors.primaryCtaText} /> : null}
                  <Text style={[auraButtonTextStyle(colors, "primary", productLinkBusy || !normalizedProductLink), { fontSize: 14 }]}>
                    {productLinkLoading ? "Searching..." : productLinkPreview ? "Search again" : "Search"}
                  </Text>
                </Pressable>
              </View>

              {productLinkRecoverableError ? (
                <View
                  style={{
                    borderRadius: 22,
                    padding: 14,
                    gap: 12,
                    backgroundColor: colors.surfaceMuted,
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                  }}
                >
                  <View style={{ gap: 5 }}>
                    <Text style={{ color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: "600" }}>
                      {productLinkRecoverableError.title}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, fontWeight: "400" }}>
                      {productLinkRecoverableError.message}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
                    <Pressable
                      onPress={() => void handleImportProductLink()}
                      disabled={productLinkBusy || !normalizedProductLink}
                      style={({ pressed }) => ({
                        minHeight: 42,
                        borderRadius: 999,
                        paddingHorizontal: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.accent,
                        borderWidth: 1,
                        borderColor: colors.borderStrong,
                        opacity: productLinkBusy || !normalizedProductLink ? 0.5 : pressed ? 0.78 : 1,
                      })}
                    >
                      <Text style={{ color: colors.primaryText, fontSize: 12.5, fontWeight: "600" }}>Try again</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleAddProductLinkFromScreenshot()}
                      disabled={productLinkBusy}
                      style={({ pressed }) => ({
                        minHeight: 42,
                        borderRadius: 999,
                        paddingHorizontal: 13,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: colors.border,
                        opacity: productLinkBusy ? 0.5 : pressed ? 0.78 : 1,
                      })}
                    >
                      <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>Add from screenshot</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleOpenProductLinkManually()}
                      disabled={!normalizedProductLink}
                      style={({ pressed }) => ({
                        minHeight: 42,
                        borderRadius: 999,
                        paddingHorizontal: 13,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "transparent",
                        borderWidth: 1,
                        borderColor: "transparent",
                        opacity: !normalizedProductLink ? 0.5 : pressed ? 0.78 : 1,
                      })}
                    >
                      <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: "600" }}>Open link</Text>
                    </Pressable>
                    <Pressable
                      onPress={closeProductLinkSheet}
                      disabled={productLinkBusy}
                      style={({ pressed }) => ({
                        minHeight: 42,
                        borderRadius: 999,
                        paddingHorizontal: 13,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "transparent",
                        borderWidth: 1,
                        borderColor: "transparent",
                        opacity: productLinkBusy ? 0.5 : pressed ? 0.78 : 1,
                      })}
                    >
                      <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: "600" }}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {productLinkLoading ? (
                <View
                  style={{
                    borderRadius: 22,
                    padding: 14,
                    gap: 10,
                    backgroundColor: colors.surfaceMuted,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <AuraSkeletonLine width="48%" height={12} />
                  <AuraSkeletonLine width="74%" height={10} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: "400" }}>
                    Reading product details...
                  </Text>
                </View>
              ) : null}

              {productLinkPreview && productLinkDraft ? (
                <View
                  style={{
                    borderRadius: 24,
                    padding: 12,
                    gap: 12,
                    backgroundColor: colors.surfaceMuted,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View
                      style={{
                        width: 96,
                        height: 112,
                        borderRadius: 18,
                        backgroundColor: "#f6efe6",
                        overflow: "hidden",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {productLinkImageUrl ? (
                        <AppImage
                          source={{ uri: productLinkImageUrl }}
                          resizeMode="contain"
                          style={{ width: "100%", height: "100%" }}
                        />
                      ) : (
                        <Ionicons name="shirt-outline" size={26} color={colors.textOnLightSecondary} />
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 7, paddingTop: 1 }}>
                      <Text
                        selectable
                        numberOfLines={3}
                        style={{ color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: "600" }}
                      >
                        {productLinkDraft.name || "Untitled item"}
                      </Text>
                      <View style={{ gap: 5 }}>
                        <ProductLinkPreviewLine label="Brand" value={productLinkDraft.brand || "Not found"} />
                        <ProductLinkPreviewLine label="Category" value={productLinkCategoryLabel(productLinkDraft.category)} />
                        <ProductLinkPreviewLine label="Color" value={productLinkDraft.color || "Not found"} />
                        {productLinkMaterial ? <ProductLinkPreviewLine label="Material" value={productLinkMaterial} /> : null}
                        {productLinkFit ? <ProductLinkPreviewLine label="Fit" value={productLinkFit} /> : null}
                        {productLinkPrice ? <ProductLinkPreviewLine label="Price" value={productLinkPrice} /> : null}
                        {productLinkSource ? <ProductLinkPreviewLine label="Source" value={productLinkSource} /> : null}
                      </View>
                    </View>
                  </View>

                  {productLinkEditing ? (
                    <View style={{ gap: 10 }}>
                      <ProductLinkReviewField
                        label="Name"
                        value={productLinkDraft.name}
                        onChangeText={(value) =>
                          setProductLinkDraft((current) => (current ? { ...current, name: value } : current))
                        }
                      />
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <ProductLinkReviewField
                          label="Brand"
                          value={productLinkDraft.brand}
                          onChangeText={(value) =>
                            setProductLinkDraft((current) => (current ? { ...current, brand: value } : current))
                          }
                          style={{ flex: 1 }}
                        />
                        <ProductLinkReviewField
                          label="Color"
                          value={productLinkDraft.color}
                          onChangeText={(value) =>
                            setProductLinkDraft((current) => (current ? { ...current, color: value } : current))
                          }
                          style={{ flex: 1 }}
                        />
                      </View>
                      <ProductLinkReviewField
                        label="Size"
                        value={productLinkDraft.size}
                        placeholder="Optional"
                        onChangeText={(value) =>
                          setProductLinkDraft((current) => (current ? { ...current, size: value } : current))
                        }
                      />
                      <View style={{ gap: 7 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 14, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase" }}>
                          Category
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                          <View style={{ flexDirection: "row", gap: 8, paddingRight: 2 }}>
                            {PRODUCT_LINK_CATEGORY_OPTIONS.map((option) => {
                              const selected = productLinkDraft.category === option.key;
                              return (
                                <Pressable
                                  key={option.key}
                                  onPress={() =>
                                    setProductLinkDraft((current) =>
                                      current ? { ...current, category: option.key } : current
                                    )
                                  }
                                  style={({ pressed }) => ({
                                    ...auraChipStyle(colors, selected ? "selected" : "filter"),
                                    paddingHorizontal: 12,
                                    opacity: pressed ? 0.76 : 1,
                                  })}
                                >
                                  <Text
                                    style={[
                                      auraChipTextStyle(colors, selected ? "selected" : "filter"),
                                      { fontSize: 12, lineHeight: 15 },
                                    ]}
                                  >
                                    {option.label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </ScrollView>
                      </View>
                    </View>
                  ) : null}

                  <View style={{ gap: 10 }}>
                    <Pressable
                      onPress={() => void handleSaveProductLinkToCloset()}
                      disabled={!productLinkCanSave || productLinkSaving}
                      style={({ pressed }) => ({
                        ...auraButtonStyle(colors, "primary", !productLinkCanSave || productLinkSaving),
                        flexDirection: "row",
                        gap: 8,
                        minHeight: 56,
                        opacity: !productLinkCanSave || productLinkSaving ? 0.55 : pressed ? 0.86 : 1,
                      })}
                    >
                      {productLinkSaving ? <ActivityIndicator size="small" color={colors.primaryCtaText} /> : null}
                      <Text style={[auraButtonTextStyle(colors, "primary", !productLinkCanSave || productLinkSaving), { fontSize: 14 }]}>
                        {productLinkSaving ? "Adding..." : "Add to Wardrobe"}
                      </Text>
                    </Pressable>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Pressable
                        onPress={() => setProductLinkEditing((editing) => !editing)}
                        disabled={productLinkSaving}
                        style={({ pressed }) => ({
                          flex: 1,
                          ...auraButtonStyle(colors, "secondary", productLinkSaving, "compact"),
                          minHeight: 44,
                          opacity: productLinkSaving ? 0.55 : pressed ? 0.82 : 1,
                        })}
                      >
                        <Text style={[auraButtonTextStyle(colors, "secondary", productLinkSaving), { fontSize: 13 }]}>
                          {productLinkEditing ? "Done" : "Edit details"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={closeProductLinkSheet}
                        disabled={productLinkSaving}
                        style={({ pressed }) => ({
                          flex: 1,
                          ...auraButtonStyle(colors, "secondary", productLinkSaving, "compact"),
                          minHeight: 44,
                          opacity: productLinkSaving ? 0.55 : pressed ? 0.82 : 1,
                        })}
                      >
                        <Text style={[auraButtonTextStyle(colors, "secondary", productLinkSaving), { fontSize: 13 }]}>
                          Cancel
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ProductLinkPreviewLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ width: 58, color: colors.textSecondary, fontSize: 11, lineHeight: 14, fontWeight: "500" }}>
        {label}
      </Text>
      <Text
        selectable
        numberOfLines={1}
        style={{ flex: 1, color: colors.text, fontSize: 12, lineHeight: 15, fontWeight: "500" }}
      >
        {value}
      </Text>
    </View>
  );
}

function ProductLinkReviewField({
  label,
  value,
  onChangeText,
  placeholder,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: React.ComponentProps<typeof View>["style"];
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 14, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase" }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        autoCorrect
        keyboardAppearance="dark"
        style={{
          minHeight: 44,
          borderRadius: 16,
          paddingHorizontal: 12,
          color: colors.text,
          backgroundColor: colors.inputBackground,
          borderWidth: 1,
          borderColor: colors.border,
          fontSize: 13,
          fontWeight: "400",
        }}
      />
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
        ...auraButtonStyle(colors, "secondary", disabled),
        flexDirection: "row",
        gap: 12,
        minHeight: 52,
        paddingHorizontal: 15,
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.border,
        justifyContent: "flex-start",
        opacity: disabled ? 0.5 : pressed ? 0.76 : 1,
      })}
    >
      <Ionicons name={icon} size={19} color={colors.text} />
          <Text style={[auraButtonTextStyle(colors, "secondary", disabled), { fontSize: 14.5, fontWeight: "600" }]}>
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
        ...auraButtonStyle(colors, tone === "destructive" ? "danger" : "tertiary", disabled),
        minHeight: 54,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
      })}
    >
      <Ionicons
        name={icon}
        size={18}
        color={tone === "destructive" ? colors.danger : colors.text}
      />
      <Text
        style={{
          color: tone === "destructive" ? colors.danger : colors.text,
          fontSize: 11.5,
          fontWeight: "600",
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
