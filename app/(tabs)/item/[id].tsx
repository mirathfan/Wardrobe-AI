import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { deleteDoc, doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppColors } from "@/constants/theme";
import AppImage from "@/src/components/common/AppImage";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { SafeScreen } from "@/src/components/SafeScreen";
import AuraSubpageHeader from "@/src/components/ui/AuraSubpageHeader";
import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraCardStyle,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { db } from "@/src/lib/firebase";
import { runHaptic } from "@/src/lib/haptics";
import { getItemImageUrl } from "@/src/lib/itemImage";
import {
  getIngestionStatus,
  LAUNDRY_STATUS_LABELS,
  markNeedsWash,
  markWashed as markWashedItem,
  normalizeLaundryStatus,
  sendToLaundry,
} from "@/src/lib/items";
import { safeGoBack } from "@/src/lib/navigation";
import { Toast } from "@/src/lib/toast";
import type { ClothingItem, LaundryStatus } from "@/src/types/ClothingItem";

type TimestampLike = {
  toDate: () => Date;
};

type ItemDetails = ClothingItem & {
  id: string;
  source?: string | null;
  sourceUrl?: string | null;
  retailer?: string | null;
  domain?: string | null;
  updatedAt?: number | string | TimestampLike | null;
  itemLifecycleStatus?: string | null;
  ingestionSource?: {
    sourceType?: string | null;
    sourceUrl?: string | null;
    domain?: string | null;
  } | null;
  linkMetadata?: {
    sourceUrl?: string | null;
    domain?: string | null;
    retailer?: string | null;
  } | null;
};

type DetailImageAsset = {
  uri: string;
  isPrimary: boolean;
};

type DetailRow = {
  label: string;
  value: string;
  multiline?: boolean;
};

type DetailGroupItem = DetailRow;

type DetailGroup = {
  title: string;
  items: DetailGroupItem[];
};

const STATUS_OPTIONS: LaundryStatus[] = ["needs_wash", "in_laundry", "clean"];
const DETAIL_RADIUS = 24;
const BUTTON_HEIGHT = 52;

function cleanString(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isMeaningful(value: unknown) {
  if (Array.isArray(value)) return value.some((entry) => cleanString(entry));
  return Boolean(cleanString(value));
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function displayValue(value: unknown) {
  const normalized = cleanString(value);
  return normalized ? titleCase(normalized) : "";
}

function normalizeDisplayToken(value: unknown) {
  const normalized = cleanString(value)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? titleCase(normalized) : "";
}

function dedupeTokens(values: unknown[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  const pushValue = (value: unknown) => {
    const normalized = normalizeDisplayToken(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    next.push(normalized);
  };

  values.forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => dedupeTokens([entry]).forEach(pushValue));
      return;
    }
    cleanString(value)
      .split(/\s*(?:\/|\||,|\u2022)\s*/u)
      .filter(Boolean)
      .forEach(pushValue);
  });
  return next;
}

function uniqueStrings(values: unknown[]) {
  return dedupeTokens(values);
}

function joinLabels(values: unknown[]) {
  return dedupeTokens(values).join(" / ");
}

function hasToDate(value: unknown): value is TimestampLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  );
}

function dateFromValue(value?: unknown | null) {
  if (!value) return null;
  if (hasToDate(value)) {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatDateTime(value?: unknown | null) {
  const date = dateFromValue(value);
  return date ? date.toLocaleString() : "";
}

function isValidImageUrl(value?: string | null) {
  const url = cleanString(value);
  if (!url) return false;
  return url.startsWith("file://") || /^https?:\/\//i.test(url);
}

function isValidHttpUrl(value?: string | null) {
  const url = cleanString(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeHttpUrl(value?: string | null) {
  const url = cleanString(value);
  if (!isValidHttpUrl(url)) return null;
  return url;
}

function domainFromUrl(value?: string | null) {
  const url = normalizeHttpUrl(value);
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\d*\./i, "");
  } catch {
    return "";
  }
}

function dedupeImageAssets(images: DetailImageAsset[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = image.uri.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getItemDetailImages(item: ItemDetails | null): DetailImageAsset[] {
  if (!item) return [];

  const next: DetailImageAsset[] = [];
  const sources = [...(item.images ?? []), ...(item.photos?.images ?? [])];

  for (const image of sources) {
    const isPrimary = Boolean(image?.isPrimary);
    const candidate = isPrimary
      ? getItemImageUrl(item, { variant: "hero" })
      : cleanString(image?.cleanedUrl ?? image?.originalUrl) || null;

    if (candidate && isValidImageUrl(candidate)) {
      next.push({ uri: candidate, isPrimary });
    }
  }

  const fallback = getItemImageUrl(item, { variant: "hero" });
  if (fallback && isValidImageUrl(fallback)) {
    next.push({ uri: fallback, isPrimary: next.length === 0 });
  }

  const deduped = dedupeImageAssets(next);
  return deduped.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

function ingestionStatusLabel(item: ItemDetails | null | undefined) {
  const status = getIngestionStatus(item) ?? "pending";
  return titleCase(status);
}

function itemTitle(item: ItemDetails) {
  return (
    cleanString(item.name) ||
    uniqueStrings([item.primaryColor, item.colorLabel, item.brand, item.subCategory, item.type, item.category])
      .map(titleCase)
      .join(" ") ||
    "Closet Item"
  );
}

function itemSubtitle(item: ItemDetails) {
  return cleanString(item.brand);
}

function productUrlForItem(item: ItemDetails | null | undefined) {
  if (!item) return null;
  return (
    normalizeHttpUrl(item.sourceUrl) ??
    normalizeHttpUrl(item.ingestionSource?.sourceUrl) ??
    normalizeHttpUrl(item.linkMetadata?.sourceUrl)
  );
}

function sourceLabelForItem(item: ItemDetails) {
  return (
    cleanString(item.retailer) ||
    cleanString(item.linkMetadata?.retailer) ||
    cleanString(item.domain) ||
    cleanString(item.ingestionSource?.domain) ||
    domainFromUrl(productUrlForItem(item)) ||
    cleanString(item.source)
  );
}

function classificationLabel(item: ItemDetails) {
  return joinLabels([item.category, item.subCategory || item.type]);
}

function colorLabel(item: ItemDetails) {
  return joinLabels([item.primaryColor, item.colorLabel, item.displayColor, item.displayColors, item.colors]);
}

function detectedColorLabel(item: ItemDetails) {
  return joinLabels([item.aiColorLabel, item.aiColors, item.pixelColors]);
}

function formatHeroColors(item: ItemDetails) {
  return dedupeTokens([
    item.displayColors,
    item.displayColor,
    item.primaryColor,
    item.colorLabel,
    item.colors,
  ]).join(" / ");
}

function formatHeroDescriptor(item: ItemDetails) {
  return dedupeTokens([
    item.material,
    item.fit,
  ])
    .join(" \u2022 ");
}

function buildHeroCategoryLine(item: ItemDetails) {
  return dedupeTokens([item.category, item.subCategory || item.type]).join(" / ");
}

function primaryColorForDetail(item: ItemDetails) {
  return dedupeTokens([item.primaryColor, item.colorLabel, item.displayColor])[0] ?? "";
}

function visibleColorsForDetail(item: ItemDetails) {
  const primary = primaryColorForDetail(item).toLowerCase();
  const visibleColors = dedupeTokens([item.displayColors, item.colors, item.aiColors, item.pixelColors]);
  if (visibleColors.length <= 1 && visibleColors[0]?.toLowerCase() === primary) return "";
  return visibleColors
    .slice(0, 6)
    .join(" / ");
}

function isUsefulDetailValue(value: string) {
  const normalized = cleanString(value).toLowerCase();
  return Boolean(normalized) && !["unknown", "not set", "n/a", "na", "none", "-"].includes(normalized);
}

function filterDetailGroupItems(items: DetailGroupItem[]) {
  return items.filter((item) => isMeaningful(item.value) && isUsefulDetailValue(item.value));
}

function buildHeroMetadataRows(item: ItemDetails) {
  return filterDetailGroupItems([
    { label: "Category", value: buildHeroCategoryLine(item) },
    { label: "Color", value: formatHeroColors(item) },
    { label: "Material / Fit", value: formatHeroDescriptor(item) },
  ]);
}

function buildDetailGroups(item: ItemDetails) {
  const groups: DetailGroup[] = [
    {
      title: "Overview",
      items: filterDetailGroupItems([
        { label: "Category", value: displayValue(item.category) },
        { label: "Fit", value: displayValue(item.fit) },
        { label: "Brand", value: cleanString(item.brand) },
      ]),
    },
    {
      title: "Material & Design",
      items: filterDetailGroupItems([
        { label: "Material", value: displayValue(item.material) || joinLabels([item.materials]) },
        { label: "Pattern", value: displayValue(item.pattern) },
        { label: "Style", value: displayValue(item.style) },
      ]),
    },
    {
      title: "Color",
      items: filterDetailGroupItems([
        { label: "Primary", value: primaryColorForDetail(item) || colorLabel(item) },
        { label: "Secondary", value: visibleColorsForDetail(item) },
      ]),
    },
    {
      title: "Occasion",
      items: filterDetailGroupItems([
        { label: "Season", value: joinLabels([item.seasonTags]) },
        { label: "Use", value: joinLabels([item.occasionTags]) },
        { label: "Tags", value: joinLabels([item.detailTags, item.aestheticTags]), multiline: true },
      ]),
    },
  ];

  return groups.filter((group) => group.items.length > 0);
}

// Advanced metadata is intentionally kept available while the Advanced UI is hidden.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildAdvancedRows(item: ItemDetails) {
  const rows: DetailRow[] = [
    { label: "Ingestion status", value: ingestionStatusLabel(item) },
    { label: "Lifecycle", value: displayValue(item.itemLifecycleStatus || item.draftState) },
    {
      label: "Source",
      value: joinLabels([
        item.source,
        item.ingestionSource?.sourceType,
        item.sourceUrl ? domainFromUrl(item.sourceUrl) : null,
      ]),
    },
    { label: "Classification", value: classificationLabel(item) },
    { label: "Detected colors", value: detectedColorLabel(item) || colorLabel(item) },
    { label: "Created", value: formatDateTime(item.createdAt) },
    { label: "Updated", value: formatDateTime(item.updatedAt) },
  ];
  return rows.filter((row) => isMeaningful(row.value));
}

function auraInsightForItem(item: ItemDetails) {
  const token = uniqueStrings([item.category, item.subCategory, item.type, item.style])
    .join(" ")
    .toLowerCase();
  if (/\b(shoe|shoes|sneaker|sneakers|boot|boots|loafer|loafers|heel|heels|footwear)\b/.test(token)) {
    return "Use this as the anchor piece and keep the rest of the outfit balanced.";
  }
  if (/\b(outerwear|jacket|coat|blazer|hoodie|cardigan|overshirt|trench|parka)\b/.test(token)) {
    return "Layer over basics and keep inner pieces visually lighter.";
  }
  if (/\b(top|shirt|tee|tshirt|t-shirt|sweater|blouse|tank|polo|kurta)\b/.test(token)) {
    return "Works well with neutral bottoms, clean sneakers, or layered outerwear.";
  }
  if (/\b(bottom|pants|trousers|jeans|shorts|skirt|cargo|chinos)\b/.test(token)) {
    return "Pair with a simple top and let the silhouette set the outfit direction.";
  }
  if (/\b(accessory|bag|belt|watch|hat|cap|sunglasses|scarf|jewelry|jewellery)\b/.test(token)) {
    return "Use this as a finishing accent and keep nearby colors intentional.";
  }
  return "Build around the strongest visual cue, then keep color and proportion balanced.";
}

function auraPromptForItem(item: ItemDetails) {
  const details = uniqueStrings([
    itemTitle(item),
    item.brand,
    item.category,
    item.subCategory,
    item.primaryColor || item.colorLabel,
    item.material,
    item.fit,
  ]).join(", ");
  return [
    `Style this closet item for me: ${details}.`,
    `Closet item id: ${item.id}.`,
    "Build a wearable outfit around it using my closet where possible and keep the advice concise.",
  ].join("\n");
}

function shareMessageForItem(item: ItemDetails, productUrl?: string | null) {
  const name = itemTitle(item);
  const brand = cleanString(item.brand);
  const title = brand ? `${name} by ${brand}` : name;
  return [title, productUrl].filter(Boolean).join("\n");
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    card: {
      ...auraCardStyle(colors, "card"),
      padding: 16,
      gap: 16,
      borderRadius: DETAIL_RADIUS,
    },
    heroCard: {
      ...auraCardStyle(colors, "largeGlass"),
      borderColor: colors.borderWarm,
      borderRadius: 28,
      padding: 5,
      overflow: "hidden",
      backgroundColor: "rgba(43,18,76,0.30)",
    },
    heroBlock: {
      gap: 14,
    },
    heroOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "flex-end",
      paddingHorizontal: 18,
      paddingBottom: 16,
      borderRadius: 22,
      overflow: "hidden",
    },
    heroOverlayCopy: {
      gap: 4,
    },
    heroSummary: {
      gap: 9,
      paddingHorizontal: 2,
      paddingTop: 2,
    },
    heroSummaryRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
    },
    sectionBlock: {
      gap: 10,
    },
    sectionTitleSmall: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "900",
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 14,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowLast: {
      borderBottomWidth: 0,
      paddingBottom: 0,
    },
    actionStack: {
      gap: 10,
    },
    secondaryActionRow: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 12,
    },
    tertiaryActionRow: {
      flexDirection: "row",
      gap: 10,
    },
    actionButton: {
      minWidth: 0,
      minHeight: BUTTON_HEIGHT,
      borderRadius: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 0,
    },
    primaryActionButton: {
      width: "100%",
    },
    secondaryActionButton: {
      width: "100%",
      minHeight: 48,
    },
    tertiaryActionButton: {
      flex: 1,
      minHeight: 42,
      paddingHorizontal: 13,
      borderRadius: 16,
    },
    imagePlaceholder: {
      minHeight: 330,
      borderRadius: 22,
      backgroundColor: colors.chipBackground,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    selectedStatusSegment: {
      backgroundColor: colors.primary,
      borderColor: "transparent",
    },
    unselectedStatusSegment: {
      backgroundColor: "transparent",
      borderColor: "transparent",
    },
    statusControl: {
      flexDirection: "row",
      padding: 3,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: "rgba(251,228,216,0.12)",
      backgroundColor: "rgba(9,0,11,0.24)",
    },
    statusSegment: {
      flex: 1,
      minHeight: 36,
      borderRadius: 12,
      borderWidth: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    insightCard: {
      padding: 14,
      gap: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "rgba(223,182,178,0.12)",
      backgroundColor: "rgba(43,18,76,0.34)",
    },
    insightHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    insightIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(223,182,178,0.14)",
      borderWidth: 1,
      borderColor: "rgba(223,182,178,0.22)",
    },
    insightButtonRow: {
      flexDirection: "row",
      gap: 10,
    },
    insightButton: {
      flex: 1,
      minHeight: 40,
      borderRadius: 16,
    },
    detailGroups: {
      gap: 18,
    },
    detailGroupCard: {
      borderRadius: 0,
      padding: 0,
      gap: 0,
      backgroundColor: "transparent",
    },
    detailGroupHeader: {
      paddingBottom: 4,
    },
    detailGroupItems: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(251,228,216,0.10)",
    },
    detailValueRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 14,
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "rgba(251,228,216,0.08)",
    },
    detailValueRowLast: {
      borderBottomWidth: 0,
    },
    detailLabel: {
      width: 104,
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 18,
      fontWeight: "800",
    },
    detailValueText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14.5,
      lineHeight: 20,
      fontWeight: "700",
      textAlign: "right",
    },
    productSourceButton: {
      ...auraButtonStyle(colors, "secondary"),
      minHeight: 48,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    modalRoot: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      textAlign: "center",
    },
    modalCloseButton: {
      position: "absolute",
      right: 12,
      zIndex: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: colors.surfaceGlass,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalImageStage: {
      width: "100%",
      minHeight: 360,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.outfitBoardBackground,
      borderRadius: 20,
      overflow: "hidden",
      paddingHorizontal: 24,
      paddingVertical: 24,
      borderWidth: 1,
      borderColor: colors.borderWarm,
    },
    carouselFrame: {
      width: "100%",
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    carouselPagination: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 2,
    },
    carouselCounter: {
      minHeight: 28,
      borderRadius: 999,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(43,18,76,0.42)",
      borderWidth: 1,
      borderColor: "rgba(251,228,216,0.10)",
    },
    actionMenuBackdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      backgroundColor: "rgba(9,0,11,0.68)",
    },
    actionMenuCard: {
      width: "100%",
      maxWidth: 420,
      ...auraCardStyle(colors, "sheet"),
      padding: 0,
      overflow: "hidden",
      borderRadius: 18,
      borderColor: "rgba(251,228,216,0.12)",
    },
    actionMenuSurface: {
      padding: 12,
      gap: 8,
      backgroundColor: "rgba(43,18,76,0.60)",
    },
    actionMenuHandle: {
      alignSelf: "center",
      width: 42,
      height: 3,
      borderRadius: 999,
      backgroundColor: "rgba(251,228,216,0.18)",
      marginBottom: 4,
    },
    actionMenuButton: {
      ...auraButtonStyle(colors, "secondary", false, "compact"),
      minHeight: 52,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      borderRadius: 14,
      backgroundColor: "rgba(82,43,91,0.20)",
      borderColor: "rgba(251,228,216,0.10)",
    },
  });
}

function DetailGroupBlock({ group }: { group: DetailGroup }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.detailGroupCard}>
      <View style={styles.detailGroupHeader}>
        <Text style={{ color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "900" }}>
          {group.title}
        </Text>
      </View>
      <View style={styles.detailGroupItems}>
        {group.items.map((item, index) => (
          <View
            key={`${group.title}-${item.label}`}
            style={[
              styles.detailValueRow,
              index === group.items.length - 1 ? styles.detailValueRowLast : null,
            ]}
          >
            <Text style={styles.detailLabel}>{item.label}</Text>
            <Text
              selectable
              numberOfLines={item.multiline ? undefined : 3}
              style={styles.detailValueText}
            >
              {item.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function HeroMetadataSummary({ item }: { item: ItemDetails }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const rows = buildHeroMetadataRows(item);
  if (!rows.length) return null;
  return (
    <View style={styles.heroSummary}>
      {rows.map((row) => (
        <View key={row.label} style={styles.heroSummaryRow}>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, lineHeight: 18, fontWeight: "800" }}>
            {row.label}
          </Text>
          <Text
            selectable
            numberOfLines={2}
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: 13.5,
              lineHeight: 19,
              fontWeight: "700",
              textAlign: "right",
            }}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  variant,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  variant: "primary" | "secondary" | "tertiary";
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isPrimary = variant === "primary";
  const isTertiary = variant === "tertiary";
  return (
    <AuraPressable
      onPress={onPress}
      haptic="light"
      hapticTrigger="press"
      pressedScale={0.97}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        auraButtonStyle(colors, variant),
        styles.actionButton,
        isPrimary
          ? styles.primaryActionButton
          : isTertiary
            ? styles.tertiaryActionButton
            : styles.secondaryActionButton,
      ]}
    >
      <Ionicons
        name={icon}
        size={isTertiary ? 16 : 18}
        color={isPrimary ? colors.ctaText : isTertiary ? colors.textSecondary : colors.textPrimary}
      />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        style={[
          auraButtonTextStyle(colors, variant === "primary" ? "primary" : variant === "tertiary" ? "tertiary" : "secondary"),
          { fontSize: isTertiary ? 12 : 14, lineHeight: 18 },
        ]}
      >
        {label}
      </Text>
    </AuraPressable>
  );
}

function ProductHeroCard({
  item,
  images,
  activeImageIndex,
  onIndexChange,
  onPressImage,
}: {
  item: ItemDetails;
  images: DetailImageAsset[];
  activeImageIndex: number;
  onIndexChange: (index: number) => void;
  onPressImage: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const eyebrow = itemSubtitle(item) || sourceLabelForItem(item);
  const overlay = (
    <View pointerEvents="none" style={styles.heroOverlay}>
      <LinearGradient
        colors={["rgba(9,0,11,0)", "rgba(9,0,11,0.18)", "rgba(9,0,11,0.58)"]}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroOverlayCopy}>
        {eyebrow ? (
          <Text style={{ color: "rgba(251,228,216,0.70)", fontSize: 12, lineHeight: 16, fontWeight: "800" }}>
            {eyebrow}
          </Text>
        ) : null}
        <Text style={{ color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: "900" }} numberOfLines={2}>
          {itemTitle(item)}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.heroCard}>
      {images.length > 0 ? (
        <DetailImageCarousel
          images={images}
          activeIndex={activeImageIndex}
          onIndexChange={onIndexChange}
          onPressImage={onPressImage}
          overlay={overlay}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Ionicons name="image-outline" size={28} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontWeight: "800", marginTop: 8 }}>
            No photo
          </Text>
          {overlay}
        </View>
      )}
    </View>
  );
}

export default function ItemDetailsScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const uid = user?.uid ?? null;
  const { id, sourceTab, sourceRoute } = useLocalSearchParams<{
    id: string;
    sourceTab?: string;
    sourceRoute?: string;
  }>();
  const itemId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);
  const resolvedSourceTab = useMemo(() => {
    const value = Array.isArray(sourceTab) ? sourceTab[0] : sourceTab;
    if (
      value === "closet" ||
      value === "index" ||
      value === "ai" ||
      value === "calendar" ||
      value === "profile" ||
      value === "laundry" ||
      value === "aura"
    ) {
      return value;
    }
    return null;
  }, [sourceTab]);
  const resolvedSourceRoute = useMemo(() => {
    const value = Array.isArray(sourceRoute) ? sourceRoute[0] : sourceRoute;
    if (
      value === "/" ||
      value === "/(tabs)/closet" ||
      value === "/(tabs)/ai" ||
      value === "/(tabs)/calendar" ||
      value === "/(tabs)/profile" ||
      value === "/(tabs)/laundry"
    ) {
      return value;
    }
    return null;
  }, [sourceRoute]);
  const itemFallbackRoute = useMemo(() => {
    if (resolvedSourceRoute) return resolvedSourceRoute;
    if (resolvedSourceTab === "index") return "/" as const;
    if (resolvedSourceTab === "ai" || resolvedSourceTab === "aura") return "/(tabs)/ai" as const;
    if (resolvedSourceTab === "calendar") return "/(tabs)/calendar" as const;
    if (resolvedSourceTab === "profile") return "/(tabs)/profile" as const;
    if (resolvedSourceTab === "laundry") return "/(tabs)/laundry" as const;
    return "/(tabs)/closet" as const;
  }, [resolvedSourceRoute, resolvedSourceTab]);

  const [item, setItem] = useState<ItemDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [detailImageOpen, setDetailImageOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const detailImages = useMemo(() => getItemDetailImages(item), [item]);
  const productUrl = useMemo(() => productUrlForItem(item), [item]);

  function navigateBackToSource() {
    if (resolvedSourceTab) {
      router.replace(itemFallbackRoute);
      return;
    }
    safeGoBack("/(tabs)/closet");
  }

  useEffect(() => {
    if (activeImageIndex <= Math.max(detailImages.length - 1, 0)) return;
    setActiveImageIndex(0);
  }, [activeImageIndex, detailImages.length]);

  useEffect(() => {
    if (!uid || !itemId) {
      if (!uid) router.replace("/(auth)/login");
      return;
    }

    const ref = doc(db, "users", uid, "items", itemId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setItem(null);
        } else {
          setItem({ id: snap.id, ...(snap.data() as Omit<ItemDetails, "id">) });
        }
        setLoading(false);
      },
      (err) => {
        if (__DEV__) {
          console.log(err);
        }
        Alert.alert("Error", err.message);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [itemId, uid]);

  async function onSendToLaundry() {
    if (!uid || !itemId) return router.replace("/(auth)/login");

    try {
      setActionLoading(true);
      await sendToLaundry(uid, itemId);
      void runHaptic("light");
      Toast.laundryUpdated("Piece moved to laundry.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to send item to laundry";
      if (__DEV__) {
        console.log(e);
      }
      Toast.error("Laundry update failed", message);
    } finally {
      setActionLoading(false);
    }
  }

  async function onMarkNeedsWash() {
    if (!uid || !itemId) return router.replace("/(auth)/login");
    try {
      setActionLoading(true);
      await markNeedsWash(uid, itemId);
      void runHaptic("light");
      Toast.laundryUpdated("Piece marked needs wash.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to mark item as needs wash";
      if (__DEV__) {
        console.log(e);
      }
      Toast.error("Laundry update failed", message);
    } finally {
      setActionLoading(false);
    }
  }

  function onConfirmWashed() {
    if (!uid || !itemId) return router.replace("/(auth)/login");

    Alert.alert("Mark as washed?", "This will reset wear count and make item available.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark washed",
        onPress: async () => {
          try {
            setActionLoading(true);
            await markWashedItem(uid, itemId);
            void runHaptic("light");
            Toast.laundryUpdated("Piece is clean and ready.");
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "Failed to mark item as washed";
            if (__DEV__) {
              console.log(e);
            }
            Toast.error("Laundry update failed", message);
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }

  function onLaundryStatusPress(status: LaundryStatus) {
    if (!item || normalizeLaundryStatus(item) === status) return;
    if (status === "clean") {
      onConfirmWashed();
    } else if (status === "in_laundry") {
      void onSendToLaundry();
    } else {
      void onMarkNeedsWash();
    }
  }

  async function onDelete() {
    if (!uid || !itemId) return router.replace("/(auth)/login");

    Alert.alert("Delete item?", "This will remove the item from your wardrobe.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "users", uid, "items", itemId));
            navigateBackToSource();
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "Failed to delete";
            if (__DEV__) {
              console.log(e);
            }
            Alert.alert("Error", message);
          }
        },
      },
    ]);
  }

  function onEdit() {
    if (!itemId) return;
    router.push({
      pathname: "/(tabs)/add",
      params: {
        editId: itemId,
        sourceItemId: itemId,
        sourceRoute: "/(tabs)/item/[id]",
      },
    });
  }

  function onOpenOverflowMenu() {
    void runHaptic("selection");
    setActionMenuVisible(true);
  }

  function onStyleWithAura(currentItem: ItemDetails) {
    router.push({
      pathname: "/(tabs)/ai",
      params: {
        prompt: auraPromptForItem(currentItem),
        promptKey: `item-${currentItem.id}-${Date.now()}`,
      },
    });
  }

  function onAddToOutfit() {
    if (!itemId) return;
    router.push({
      pathname: "/(tabs)/studio",
      params: {
        itemId,
        sourceRoute: "/(tabs)/item/[id]",
      },
    });
  }

  async function onOpenProductUrl(url: string) {
    if (!isValidHttpUrl(url)) {
      Toast.error("Link unavailable", "This product link is not valid.");
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not open that product link.";
      Toast.error("Could not open link", message);
    }
  }

  async function onShareItem(currentItem: ItemDetails) {
    const message = shareMessageForItem(currentItem, productUrl);
    try {
      void runHaptic("light");
      await Share.share({
        title: itemTitle(currentItem),
        message,
        ...(productUrl ? { url: productUrl } : {}),
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Could not share this item.";
      Toast.error("Share failed", errorMessage);
    }
  }

  const renderContent = () => {
    if (loading) {
      return (
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 64, gap: 12 }}>
          <ActivityIndicator color={colors.text} />
          <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>Loading item...</Text>
        </View>
      );
    }

    if (!item) {
      return (
        <View style={styles.card}>
          <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Item not found</Text>
          <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
            This closet item may have been removed.
          </Text>
        </View>
      );
    }

    const status = normalizeLaundryStatus(item);
    const detailGroups = buildDetailGroups(item);
    const productSourceLabel = productUrl ? sourceLabelForItem(item) || domainFromUrl(productUrl) : "";

    return (
      <>
        <View style={styles.heroBlock}>
          <ProductHeroCard
            item={item}
            images={detailImages}
            activeImageIndex={activeImageIndex}
            onIndexChange={setActiveImageIndex}
            onPressImage={() => setDetailImageOpen(true)}
          />
          <HeroMetadataSummary item={item} />
        </View>

        <View style={styles.actionStack}>
          <ActionButton
            label="Style with AURA"
            icon="sparkles-outline"
            variant="primary"
            onPress={() => onStyleWithAura(item)}
            accessibilityLabel="Style this item with AURA"
          />
          <ActionButton
            label="Add to Outfit"
            icon="shirt-outline"
            variant="secondary"
            onPress={onAddToOutfit}
            accessibilityLabel="Add this item to an outfit"
          />
          <View style={styles.tertiaryActionRow}>
            <ActionButton
              label="Share"
              icon="share-outline"
              variant="tertiary"
              onPress={() => void onShareItem(item)}
              accessibilityLabel="Share this item"
            />
            {productUrl ? (
              <ActionButton
                label="View product"
                icon="open-outline"
                variant="tertiary"
                onPress={() => void onOpenProductUrl(productUrl)}
                accessibilityLabel="View original product"
              />
            ) : null}
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <View style={styles.statusControl}>
            {STATUS_OPTIONS.map((option) => {
              const selected = status === option;
              return (
                <AuraPressable
                  key={option}
                  onPress={() => onLaundryStatusPress(option)}
                  disabled={actionLoading || selected}
                  haptic="selection"
                  hapticTrigger="press"
                  pressedScale={0.97}
                  disabledOpacity={selected ? 1 : 0.58}
                  accessibilityRole="button"
                  accessibilityLabel={`Set status to ${LAUNDRY_STATUS_LABELS[option]}`}
                  accessibilityState={{ selected, disabled: actionLoading || selected }}
                  style={[
                    styles.statusSegment,
                    selected ? styles.selectedStatusSegment : styles.unselectedStatusSegment,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    style={{
                      color: selected ? colors.primaryText : colors.textSecondary,
                      fontSize: 12,
                      fontWeight: "900",
                    }}
                  >
                    {LAUNDRY_STATUS_LABELS[option]}
                  </Text>
                </AuraPressable>
              );
            })}
          </View>
        </View>

        <View style={styles.insightCard}>
          <View style={styles.insightHeader}>
            <View style={styles.insightIcon}>
              <Ionicons name="sparkles-outline" size={16} color={colors.ctaCream} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.text, fontSize: 15.5, lineHeight: 20, fontWeight: "900" }}>
                Styling read
              </Text>
              <Text
                numberOfLines={2}
                style={{ color: colors.textSecondary, fontSize: 13.5, lineHeight: 19, fontWeight: "600" }}
              >
                {auraInsightForItem(item)}
              </Text>
            </View>
          </View>
          <View style={styles.insightButtonRow}>
            <AuraPressable
              onPress={() => onStyleWithAura(item)}
              haptic="light"
              hapticTrigger="press"
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityLabel="Ask AURA about this item"
              style={[
                auraButtonStyle(colors, "primary"),
                styles.insightButton,
              ]}
            >
              <Text style={[auraButtonTextStyle(colors, "primary"), { fontSize: 13 }]}>
                Ask AURA
              </Text>
            </AuraPressable>
            <AuraPressable
              onPress={onAddToOutfit}
              haptic="light"
              hapticTrigger="press"
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityLabel="Build an outfit with this item"
              style={[
                auraButtonStyle(colors, "secondary", false, "compact"),
                styles.insightButton,
              ]}
            >
              <Text style={[auraButtonTextStyle(colors, "secondary"), { fontSize: 13 }]}>
                Build outfit
              </Text>
            </AuraPressable>
          </View>
        </View>

        {detailGroups.length ? (
          <View style={styles.detailGroups}>
            {detailGroups.map((group) => (
              <DetailGroupBlock key={group.title} group={group} />
            ))}
          </View>
        ) : null}

        {productUrl ? (
          <View style={styles.sectionBlock}>
            <View style={{ gap: 10 }}>
              {productSourceLabel ? (
                <Text selectable style={{ color: colors.textPrimary, fontSize: 14.5, lineHeight: 20, fontWeight: "800" }}>
                  {productSourceLabel}
                </Text>
              ) : null}
              <AuraPressable
                onPress={() => void onOpenProductUrl(productUrl)}
                haptic="light"
                hapticTrigger="press"
                pressedScale={0.98}
                accessibilityRole="button"
                accessibilityLabel="View original product"
                style={styles.productSourceButton}
              >
                <Text style={auraButtonTextStyle(colors, "secondary")}>
                  View original product
                </Text>
                <Ionicons name="arrow-forward" size={16} color={colors.textPrimary} />
              </AuraPressable>
            </View>
          </View>
        ) : null}
      </>
    );
  };

  return (
    <SafeScreen backgroundColor={colors.background} includeTopInset={false} includeBottomInset={false}>
      <ItemImageModal
        visible={detailImageOpen}
        images={detailImages}
        initialIndex={activeImageIndex}
        onClose={() => setDetailImageOpen(false)}
      />
      <ActionMenuModal
        visible={actionMenuVisible}
        onClose={() => setActionMenuVisible(false)}
        onEdit={() => {
          setActionMenuVisible(false);
          onEdit();
        }}
        onShare={() => {
          if (!item) return;
          setActionMenuVisible(false);
          setTimeout(() => {
            void onShareItem(item);
          }, 120);
        }}
        onDelete={() => {
          setActionMenuVisible(false);
          setTimeout(() => {
            void onDelete();
          }, 160);
        }}
      />
      <AuraSubpageHeader
        title="Item"
        eyebrow="CLOSET"
        onBack={navigateBackToSource}
        fallbackRoute="/(tabs)/closet"
        rightAction={
          <Pressable
            onPress={onOpenOverflowMenu}
            accessibilityRole="button"
            accessibilityLabel="Open item actions"
            style={({ pressed }) => [
              {
                minWidth: 44,
                minHeight: 44,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </Pressable>
        }
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 8,
          paddingBottom: layout.bottomDockPadding + 56,
          gap: 24,
        }}
      >
        {renderContent()}
      </ScrollView>
    </SafeScreen>
  );
}

function ActionMenuModal({
  visible,
  onClose,
  onEdit,
  onShare,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const menuWidth = Math.min(width - 32, 420);

  function closeWithHaptic() {
    void runHaptic("selection");
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={closeWithHaptic}>
      <View style={[styles.actionMenuBackdrop, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeWithHaptic} />
        <View style={[styles.actionMenuCard, { width: menuWidth }]}>
          <BlurView intensity={34} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.actionMenuSurface}>
            <View style={styles.actionMenuHandle} />

            <AuraPressable
              onPress={() => {
                void runHaptic("light");
                onEdit();
              }}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityLabel="Edit item"
              style={styles.actionMenuButton}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="create-outline" size={17} color={colors.ctaCream} />
                <Text style={{ color: colors.textPrimary, fontSize: 14.5, fontWeight: "900" }}>
                  Edit Item
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color="rgba(251,228,216,0.36)" />
            </AuraPressable>

            <AuraPressable
              onPress={() => {
                void runHaptic("light");
                onShare();
              }}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityLabel="Share item"
              style={styles.actionMenuButton}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="share-outline" size={17} color={colors.ctaCream} />
                <Text style={{ color: colors.textPrimary, fontSize: 14.5, fontWeight: "900" }}>
                  Share Item
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color="rgba(251,228,216,0.36)" />
            </AuraPressable>

            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "rgba(251,228,216,0.08)" }} />

            <AuraPressable
              onPress={() => {
                void runHaptic("warning");
                onDelete();
              }}
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityLabel="Delete item"
              style={[
                styles.actionMenuButton,
                {
                  backgroundColor: "rgba(255,77,79,0.08)",
                  borderColor: "rgba(255,77,79,0.18)",
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="trash-outline" size={17} color="rgba(239,163,163,0.86)" />
                <Text style={{ color: "rgba(239,163,163,0.92)", fontSize: 14.5, fontWeight: "900" }}>
                  Delete Item
                </Text>
              </View>
            </AuraPressable>

            <AuraPressable
              onPress={closeWithHaptic}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityLabel="Cancel item actions"
              style={[
                styles.actionMenuButton,
                {
                  justifyContent: "center",
                },
              ]}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 14.5, fontWeight: "900" }}>
                Cancel
              </Text>
            </AuraPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ItemImageModal({
  visible,
  images,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  images: DetailImageAsset[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(initialIndex);
  }, [initialIndex, visible]);

  const imageWidth = Math.max(width - 32, 1);

  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / imageWidth);
    setActiveIndex(Math.max(0, Math.min(images.length - 1, nextIndex)));
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Text style={[styles.modalTitle, { paddingTop: insets.top + 16 }]}>Photo</Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close photo viewer"
          style={[styles.modalCloseButton, { top: insets.top + 12 }]}
        >
          <Text style={{ color: colors.text, fontWeight: "800" }}>Close</Text>
        </Pressable>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          minimumZoomScale={1}
          maximumZoomScale={4}
          bouncesZoom={false}
          centerContent
        >
          {images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: imageWidth * activeIndex, y: 0 }}
              onMomentumScrollEnd={onMomentumScrollEnd}
            >
              {images.map((image) => (
                <View
                  key={image.uri}
                  style={{
                    width: imageWidth,
                    minHeight: 360,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View style={styles.modalImageStage}>
                    <AppImage source={{ uri: image.uri }} style={{ width: "100%", height: 520 }} resizeMode="contain" />
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}
          {images.length > 1 ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 }}>
              {images.map((image, index) => (
                <View
                  key={`${image.uri}-dot`}
                  style={{
                    width: index === activeIndex ? 18 : 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: index === activeIndex ? colors.text : colors.borderStrong,
                  }}
                />
              ))}
              <Text style={{ color: colors.textSecondary, fontWeight: "700", marginLeft: 8 }}>
                {activeIndex + 1} / {images.length}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function DetailImageCarousel({
  images,
  activeIndex,
  onIndexChange,
  onPressImage,
  overlay,
}: {
  images: DetailImageAsset[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onPressImage: () => void;
  overlay?: React.ReactNode;
}) {
  const layout = useResponsiveLayout();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width, height } = useWindowDimensions();
  const cardWidth = Math.max(width - layout.horizontalPadding * 2 - 12, 1);
  const cardHeight = Math.min(480, Math.max(320, Math.round(height * 0.5)));
  const cardGap = 14;
  const pageWidth = cardWidth + cardGap;

  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    onIndexChange(Math.max(0, Math.min(images.length - 1, nextIndex)));
  }

  return (
    <View style={{ gap: 12 }}>
      <ScrollView
        horizontal
        decelerationRate="fast"
        snapToInterval={pageWidth}
        snapToAlignment="start"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: cardGap }}
        contentOffset={{ x: pageWidth * activeIndex, y: 0 }}
        onMomentumScrollEnd={onMomentumScrollEnd}
      >
        {images.map((image, index) => (
          <Pressable
            key={image.uri}
            onPress={onPressImage}
            accessibilityRole="imagebutton"
            accessibilityLabel="Open item photo"
            style={{
              width: cardWidth,
              borderRadius: 22,
              marginRight: index === images.length - 1 ? 0 : cardGap,
            }}
          >
            <View
              style={[
                styles.carouselFrame,
                {
                  height: cardHeight,
                  borderRadius: 22,
                  backgroundColor: colors.outfitBoardBackground,
                  borderColor: colors.borderWarm,
                  paddingHorizontal: 8,
                  paddingVertical: 8,
                },
              ]}
            >
              <AppImage
                source={{ uri: image.uri }}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                resizeMode="contain"
              />
              {overlay}
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {images.length > 1 ? (
        <View style={styles.carouselPagination}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {images.map((image, index) => (
              <View
                key={`${image.uri}-pagination`}
                style={{
                  width: index === activeIndex ? 18 : 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: index === activeIndex ? colors.lightPurple : colors.borderStrong,
                }}
              />
            ))}
          </View>
          <View style={styles.carouselCounter}>
            <Text style={{ color: colors.textPrimary, fontSize: 12.5, fontWeight: "900" }}>
              {activeIndex + 1} / {images.length}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
