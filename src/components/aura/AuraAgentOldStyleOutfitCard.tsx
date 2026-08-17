import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";

import { Fonts, type AppColors } from "@/constants/theme";
import AuraAgentActionRail from "@/src/components/aura/AuraAgentActionRail";
import AuraOutfitVisualCard from "@/src/components/aura/AuraOutfitVisualCard";
import AuraPressable from "@/src/components/aura/AuraPressable";
import AppImage from "@/src/components/common/AppImage";
import {
  auraRadii,
  auraSpacing,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { formatAuraVibeLabel } from "@/src/lib/auraAgentDisplay";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { AuraLook, AuraLookPiece } from "@/src/types/aura";
import type {
  AuraAgentOutfit,
  AuraAgentOutfitItem,
  AuraAgentOutfitRole,
  AuraAgentSuggestedAction,
} from "@/src/types/auraAgent";

const MAX_EXPLANATION_LENGTH = 160;
const AGENT_OUTFIT_CARD_SIDE_MARGIN = 12;
const SHOW_AURA_AGENT_DEV_UI = __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";

export function getAgentOutfitCardWidth(
  screenWidth: number,
  sideMargin = AGENT_OUTFIT_CARD_SIDE_MARGIN,
) {
  const safeScreenWidth =
    Number.isFinite(screenWidth) && screenWidth > 0 ? screenWidth : 320;
  const safeSideMargin =
    Number.isFinite(sideMargin) && sideMargin >= 0 ? sideMargin : AGENT_OUTFIT_CARD_SIDE_MARGIN;
  return Math.max(280, Math.round(safeScreenWidth - safeSideMargin * 2));
}

type AgentDetailItem = {
  key: string;
  roleLabel: string;
  name: string;
  meta: string;
  reason: string;
  imageUrl: string | null;
};

export type AuraAgentOldStyleOutfitCardModel = {
  look: AuraLook;
  title: string;
  metaLine: string;
  explanation: string;
  detailItems: AgentDetailItem[];
  stylingTips: string[];
  missingItems: string[];
};

export type AuraAgentOldStyleOutfitCardProps = {
  outfit: AuraAgentOutfit;
  colors?: AppColors;
  selected?: boolean;
  showSelectedIndicator?: boolean;
  onSelect?: () => void;
  actions?: AuraAgentSuggestedAction[];
  onAction?: (action: AuraAgentSuggestedAction) => void;
  actionsDisabled?: boolean;
  loadingActionId?: string | null;
  compact?: boolean;
  showDetails?: boolean;
  showDevDetails?: boolean;
};

export function shouldShowSelectedPill(
  selected: boolean,
  showSelectedIndicator: boolean,
) {
  return selected && showSelectedIndicator;
}

function compactText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function titleCase(value: string) {
  return compactText(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function auraAgentRoleLabel(role: AuraAgentOutfitRole | string | null | undefined) {
  if (role === "one_piece") return "One piece";
  if (role === "footwear") return "Shoes";
  return titleCase(String(role || "item"));
}

function roleSort(role: AuraAgentOutfitRole) {
  const priority: Record<AuraAgentOutfitRole, number> = {
    outerwear: 0,
    one_piece: 1,
    top: 2,
    bottom: 3,
    footwear: 4,
    accessory: 5,
  };
  return priority[role] ?? 99;
}

function sortedItems(items: AuraAgentOutfitItem[]) {
  return [...items].sort((left, right) => {
    const roleDelta = roleSort(left.role) - roleSort(right.role);
    if (roleDelta !== 0) return roleDelta;
    return compactText(left.name).localeCompare(compactText(right.name));
  });
}

function truncateDisplayText(value: string, maxLength = MAX_EXPLANATION_LENGTH) {
  const cleaned = sanitizeDisplayText(value);
  if (cleaned.length <= maxLength) return cleaned;
  const truncated = cleaned.slice(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 120 ? truncated.slice(0, lastSpace) : truncated).trim()}...`;
}

function itemDisplayName(item: AuraAgentOutfitItem) {
  return compactText(item.name) || titleCase(item.subcategory || item.category || item.role);
}

function itemMeta(item: AuraAgentOutfitItem) {
  return [
    compactText(item.brand),
    compactText(item.subcategory || item.category),
    item.colors?.slice(0, 3).map(compactText).filter(Boolean).join(", "),
  ].filter(Boolean).join(" - ");
}

function lookRoleForAgentRole(role: AuraAgentOutfitRole): AuraLookPiece["role"] {
  if (role === "footwear") return "shoes";
  if (role === "one_piece") {
    // AuraLookCard's layout engine already understands this runtime role.
    return "one_piece" as AuraLookPiece["role"];
  }
  return role;
}

function lookPieceForAgentItem(item: AuraAgentOutfitItem): AuraLookPiece {
  return {
    role: lookRoleForAgentRole(item.role),
    itemName: itemDisplayName(item),
    source: "closet",
    itemId: null,
    imageUrl: item.imageUrl,
  };
}

export function buildAuraLookFromAgentOutfit(outfit: AuraAgentOutfit): AuraLook {
  const items = sortedItems(outfit.items ?? []);
  const title = compactText(outfit.title) || "AURA outfit";
  const vibe = formatAuraVibeLabel(outfit);

  return {
    id: null,
    lookTitle: title,
    occasion: compactText(outfit.occasion) || null,
    vibe: vibe || title,
    shortExplanation: truncateDisplayText(outfit.explanation || ""),
    stylingNote: outfit.stylingTips?.[0] ? sanitizeDisplayText(outfit.stylingTips[0]) : undefined,
    confidence: outfit.confidence ?? null,
    personalizationLabel: vibe || titleCase(outfit.formality || ""),
    pieces: items.map(lookPieceForAgentItem),
    fromCloset: items.map(itemDisplayName).filter(Boolean),
    addToComplete: (outfit.missingItems ?? []).map(compactText).filter(Boolean),
    alternates: [],
    actions: [],
  };
}

export function prepareAuraAgentOldStyleOutfitCardModel(
  outfit: AuraAgentOutfit,
): AuraAgentOldStyleOutfitCardModel {
  const items = sortedItems(outfit.items ?? []);
  return {
    look: buildAuraLookFromAgentOutfit(outfit),
    title: compactText(outfit.title) || "AURA outfit",
    metaLine: formatAuraVibeLabel(outfit),
    explanation: sanitizeDisplayText(outfit.explanation || ""),
    detailItems: items.map((item, index) => ({
      key: `detail-${index}-${item.role}-${itemDisplayName(item) || "item"}`,
      roleLabel: auraAgentRoleLabel(item.role),
      name: itemDisplayName(item),
      meta: itemMeta(item),
      reason: sanitizeDisplayText(item.reason || ""),
      imageUrl: item.imageUrl,
    })),
    stylingTips: (outfit.stylingTips ?? []).map(sanitizeDisplayText).filter(Boolean),
    missingItems: (outfit.missingItems ?? []).map(compactText).filter(Boolean),
  };
}

function stopPressPropagation(event?: GestureResponderEvent) {
  event?.stopPropagation?.();
}

function DetailImage({
  colors,
  item,
}: {
  colors: AppColors;
  item: AgentDetailItem;
}) {
  return (
    <View
      style={[
        styles.detailImageFrame,
        {
          backgroundColor: colors.surfaceMuted,
          borderColor: colors.borderSoft,
        },
      ]}
    >
      {item.imageUrl ? (
        <AppImage
          testID="aura-agent-detail-image"
          accessibilityLabel={`${item.roleLabel} detail image`}
          source={{ uri: item.imageUrl }}
          resizeMode="cover"
          style={styles.detailImage}
        />
      ) : (
        <View
          accessibilityLabel={`Missing image for ${item.roleLabel}`}
          style={styles.missingImage}
        >
          <Ionicons name="shirt-outline" size={15} color={colors.textMuted} />
        </View>
      )}
    </View>
  );
}

export function AuraAgentOutfitDetailsPanel({
  colors,
  model,
}: {
  colors: AppColors;
  model: AuraAgentOldStyleOutfitCardModel;
}) {
  return (
    <View
      style={[
        styles.details,
        {
          backgroundColor: colors.surfaceInteractive,
          borderColor: colors.borderSoft,
        },
      ]}
    >
      {model.explanation ? (
        <Text
          style={[
            auraTypography.bodySecondary,
            { color: colors.textSecondary, fontFamily: Fonts.sans },
          ]}
        >
          {model.explanation}
        </Text>
      ) : null}

      {model.detailItems.map((item) => (
        <View key={item.key} style={styles.detailRow}>
          <DetailImage colors={colors} item={item} />
          <View style={styles.detailCopy}>
            <Text
              numberOfLines={1}
              style={[auraTypography.eyebrow, styles.detailRole, { color: colors.textMuted }]}
            >
              {item.roleLabel}
            </Text>
            <Text
              numberOfLines={2}
              style={[
                styles.detailName,
                { color: colors.text, fontFamily: Fonts.sans },
              ]}
            >
              {item.name || "Closet item"}
            </Text>
            {item.meta ? (
              <Text
                numberOfLines={1}
                style={[
                  auraTypography.caption,
                  { color: colors.textSecondary, fontFamily: Fonts.sans },
                ]}
              >
                {item.meta}
              </Text>
            ) : null}
            {item.reason ? (
              <Text
                numberOfLines={2}
                style={[
                  auraTypography.caption,
                  { color: colors.textMuted, fontFamily: Fonts.sans },
                ]}
              >
                {item.reason}
              </Text>
            ) : null}
          </View>
        </View>
      ))}

      {model.stylingTips.length ? (
        <View style={styles.noteBlock}>
          <Text style={[auraTypography.eyebrow, { color: colors.textMuted }]}>
            Styling Notes
          </Text>
          {model.stylingTips.slice(0, 3).map((tip, index) => (
            <Text
              key={`${tip}-${index}`}
              style={[
                auraTypography.caption,
                { color: colors.textSecondary, fontFamily: Fonts.sans },
              ]}
            >
              {tip}
            </Text>
          ))}
        </View>
      ) : null}

      {model.missingItems.length ? (
        <View style={styles.noteBlock}>
          <Text style={[auraTypography.eyebrow, { color: colors.textMuted }]}>
            Missing Items
          </Text>
          <Text
            style={[
              auraTypography.caption,
              { color: colors.textSecondary, fontFamily: Fonts.sans },
            ]}
          >
            {model.missingItems.slice(0, 4).join(", ")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function DevDetails({
  colors,
  outfit,
}: {
  colors: AppColors;
  outfit: AuraAgentOutfit;
}) {
  const [open, setOpen] = useState(false);
  if (!SHOW_AURA_AGENT_DEV_UI) return null;
  if (outfit.confidence == null && !outfit.scoreBreakdown) return null;

  return (
    <View style={styles.devBlock}>
      <AuraPressable
        onPress={(event) => {
          stopPressPropagation(event);
          setOpen((current) => !current);
        }}
        haptic="selection"
        hapticTrigger="press"
        pressedOpacity={0.82}
        pressedScale={0.98}
        accessibilityRole="button"
        accessibilityLabel={open ? "Hide development details" : "Show development details"}
        style={[
          styles.devToggle,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.borderSoft,
          },
        ]}
      >
        <Text style={[styles.devToggleText, { color: colors.textMuted }]}>
          Dev details
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.textMuted}
        />
      </AuraPressable>
      {open ? (
        <Text
          style={[
            auraTypography.caption,
            { color: colors.textMuted, fontFamily: Fonts.mono },
          ]}
        >
          Confidence {Number(outfit.confidence ?? 0).toFixed(2)}
        </Text>
      ) : null}
    </View>
  );
}

function SelectedPill({ colors }: { colors: AppColors }) {
  return (
    <View
      accessible
      accessibilityLabel="Selected outfit"
      accessibilityRole="text"
      style={[
        styles.selectedPill,
        {
          backgroundColor: colors.accentSoft,
          borderColor: colors.purpleBorder,
        },
      ]}
    >
      <Ionicons name="checkmark" size={12} color={colors.ctaCream} />
      <Text style={[styles.selectedPillText, { color: colors.ctaCream }]}>
        Selected
      </Text>
    </View>
  );
}

export default function AuraAgentOldStyleOutfitCard({
  outfit,
  colors: providedColors,
  selected = false,
  showSelectedIndicator = false,
  onSelect,
  onAction,
  actions = [],
  actionsDisabled = false,
  loadingActionId = null,
  compact = false,
  showDetails = true,
  showDevDetails = true,
}: AuraAgentOldStyleOutfitCardProps) {
  const { colors: themeColors } = useAppTheme();
  const colors = providedColors ?? themeColors;
  const model = useMemo(() => prepareAuraAgentOldStyleOutfitCardModel(outfit), [outfit]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { width } = useWindowDimensions();
  const cardWidth = getAgentOutfitCardWidth(width);
  const hasLoadingAction = Boolean(loadingActionId);
  const showSelectedPill = shouldShowSelectedPill(selected, showSelectedIndicator);
  const cardAccessibilityLabel = showSelectedIndicator
    ? `${selected ? "Selected outfit" : "Select outfit"}, ${model.title}`
    : model.title;

  return (
    <View style={[styles.root, { maxWidth: cardWidth }]}>
      <AuraPressable
        onPress={onSelect}
        disabled={!onSelect}
        haptic="selection"
        hapticTrigger="press"
        pressedOpacity={0.96}
        pressedScale={0.995}
        disabledOpacity={1}
        accessibilityRole={onSelect ? "button" : undefined}
        accessibilityLabel={cardAccessibilityLabel}
        accessibilityState={showSelectedIndicator ? { selected } : undefined}
        style={styles.visualPressable}
      >
        <View style={styles.visualWrap}>
          <View testID="aura-agent-old-style-visual-card">
            <AuraOutfitVisualCard
              look={model.look}
              colors={colors}
              mode={compact ? "medium" : "full"}
              viewportWidth={cardWidth}
              titleAccessory={showSelectedPill ? <SelectedPill colors={colors} /> : null}
              style={[
                styles.oldCard,
                {
                  borderColor: showSelectedPill ? colors.ctaCream : colors.border,
                },
              ]}
            />
          </View>
        </View>
      </AuraPressable>

      {showDetails ? (
        <>
          <AuraPressable
            onPress={(event) => {
              stopPressPropagation(event);
              setDetailsOpen((current) => !current);
            }}
            haptic="selection"
            hapticTrigger="press"
            pressedOpacity={0.84}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={detailsOpen ? "Hide outfit details" : "Show why this works"}
            style={[
              styles.detailsToggle,
              {
                backgroundColor: colors.chipBackground,
                borderColor: colors.borderSoft,
              },
            ]}
          >
            <Text style={[styles.detailsToggleText, { color: colors.textSecondary }]}>
              {detailsOpen ? "Hide details" : "Why this works"}
            </Text>
            <Ionicons
              name={detailsOpen ? "chevron-up" : "chevron-down"}
              size={15}
              color={colors.textSecondary}
            />
          </AuraPressable>

          {detailsOpen ? <AuraAgentOutfitDetailsPanel colors={colors} model={model} /> : null}
        </>
      ) : null}
      {showDevDetails ? <DevDetails colors={colors} outfit={outfit} /> : null}

      {actions.length && onAction ? (
        <View
          style={[
            styles.connectedActions,
            {
              backgroundColor: colors.surfaceBase,
              borderColor: colors.borderSoft,
            },
          ]}
        >
          {hasLoadingAction ? (
            <View style={styles.actionLoadingHint}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={[auraTypography.caption, { color: colors.textMuted }]}>
                AURA is updating this look
              </Text>
            </View>
          ) : null}
          <AuraAgentActionRail
            colors={colors}
            actions={actions}
            disabled={actionsDisabled}
            loadingActionId={loadingActionId}
            onAction={onAction}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: "stretch",
    gap: 7,
    width: "100%",
  },
  visualPressable: {
    borderRadius: auraRadii.large,
  },
  visualWrap: {
    position: "relative",
  },
  oldCard: {
    width: "100%",
  },
  selectedPill: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 25,
    paddingHorizontal: 8,
  },
  selectedPillText: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  detailsToggle: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 12,
  },
  detailsToggleText: {
    fontSize: 12.5,
    fontWeight: "700",
    lineHeight: 16,
  },
  details: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  detailRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 64,
  },
  detailImageFrame: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    height: 58,
    justifyContent: "center",
    overflow: "hidden",
    width: 50,
  },
  detailImage: {
    height: "100%",
    width: "100%",
  },
  missingImage: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  detailCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  detailRole: {
    fontSize: 10,
    lineHeight: 13,
  },
  detailName: {
    fontSize: 13.5,
    fontWeight: "700",
    lineHeight: 18,
  },
  noteBlock: {
    gap: 5,
  },
  devBlock: {
    alignItems: "flex-start",
    gap: 7,
  },
  devToggle: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  devToggleText: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
  },
  connectedActions: {
    borderRadius: 18,
    borderWidth: 1,
    gap: auraSpacing.sm,
    marginTop: 2,
    paddingHorizontal: 11,
    paddingVertical: 12,
  },
  actionLoadingHint: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
});
