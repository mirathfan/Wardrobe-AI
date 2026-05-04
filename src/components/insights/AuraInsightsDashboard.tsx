import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  type DimensionValue,
} from "react-native";

import type { AppColors } from "@/constants/theme";
import AppImage from "@/src/components/common/AppImage";
import AuraGlassCard from "@/src/components/aura/AuraGlassCard";
import AuraPressable from "@/src/components/aura/AuraPressable";
import AuraSubpageHeader from "@/src/components/ui/AuraSubpageHeader";
import { auraButtonStyle, auraButtonTextStyle, auraTypography } from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getBestThumbnailImageSource, getItemImagePresentation } from "@/src/lib/itemImage";
import type {
  MissingPieceInsight,
  WardrobeCategoryInsight,
  WardrobeInsights,
  WardrobeItemUseInsight,
} from "@/src/lib/wardrobeInsights";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { ClothingItem } from "@/src/types/ClothingItem";

export type InsightPeriodKey = "30d" | "90d" | "all";

export const INSIGHT_PERIOD_OPTIONS: { key: InsightPeriodKey; label: string }[] = [
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
];

const INSIGHTS_BACKGROUND = "#09000B";
const INSIGHTS_CARD_BACKGROUND = "rgba(43,18,76,0.46)";
const INSIGHTS_CARD_WARM_BACKGROUND = "rgba(43,18,76,0.55)";
const INSIGHTS_SOFT_SURFACE = "rgba(82,43,91,0.24)";
const INSIGHTS_ACCENT_SURFACE = "rgba(223,182,178,0.11)";

type AuraInsightsDashboardProps = {
  insights: WardrobeInsights;
  loading?: boolean;
  period: InsightPeriodKey;
  onPeriodChange: (period: InsightPeriodKey) => void;
  onBack: () => void;
  onStyleItem: (item: ClothingItem) => void;
  onAskAuraWhatToBuy: (missingPieces: MissingPieceInsight[]) => void;
};

function percentWidth(value: number): DimensionValue {
  return `${Math.max(0, Math.min(100, value))}%`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatCurrency(value: number, currency: string, compact = false) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${formatCount(Math.round(value))}`;
  }
}

function titleForItem(item: ClothingItem) {
  return (
    sanitizeDisplayText(item.name) ||
    sanitizeDisplayText(item.subCategory) ||
    sanitizeDisplayText(item.category) ||
    "Wardrobe piece"
  );
}

function categoryForItem(item: ClothingItem) {
  const raw =
    sanitizeDisplayText(item.subCategory) ||
    sanitizeDisplayText(item.category) ||
    sanitizeDisplayText(item.type) ||
    "Closet item";
  return raw.replace(/[_-]+/g, " ");
}

function Card({
  title,
  eyebrow,
  children,
  warm = false,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  warm?: boolean;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <AuraGlassCard
      auraBorder={warm}
      warmHero={false}
      intensity={22}
      contentStyle={{
        padding: layout.cardPadding + 2,
        gap: 14,
        backgroundColor: warm ? INSIGHTS_CARD_WARM_BACKGROUND : INSIGHTS_CARD_BACKGROUND,
      }}
    >
      <View style={{ gap: 5 }}>
        {eyebrow ? (
          <Text
            style={[auraTypography.eyebrow, { color: warm ? colors.ctaCream : colors.lightPurple }]}
            numberOfLines={1}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text
          style={[auraTypography.cardTitle, { color: colors.text }]}
          numberOfLines={2}
        >
          {title}
        </Text>
      </View>
      {children}
    </AuraGlassCard>
  );
}

function PeriodChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.97}
      style={{
        minHeight: 36,
        borderRadius: 999,
        paddingHorizontal: 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? colors.purpleSurface : colors.chipBackground,
        borderWidth: 1,
        borderColor: selected ? colors.purpleBorder : colors.border,
      }}
    >
      <Text
        style={[auraTypography.chipLabel, { color: selected ? colors.ctaCream : "rgba(251,228,216,0.78)" }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </AuraPressable>
  );
}

function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: "45%",
        minWidth: 126,
        minHeight: 66,
        borderRadius: 18,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: accent ? INSIGHTS_ACCENT_SURFACE : INSIGHTS_SOFT_SURFACE,
        borderWidth: 1,
        borderColor: accent ? colors.borderWarm : colors.border,
        gap: 4,
      }}
    >
      <Text
        style={{
          color: "rgba(251,228,216,0.76)",
          fontSize: 11,
          lineHeight: 15,
          fontWeight: "700",
          letterSpacing: 0,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        selectable
        style={{
          color: colors.text,
          fontSize: 17,
          lineHeight: 22,
          fontWeight: "900",
          letterSpacing: 0,
          fontVariant: ["tabular-nums"],
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

function ProgressBar({
  value,
  colors,
}: {
  value: number;
  colors: AppColors;
}) {
  return (
    <View
      style={{
        height: 9,
        borderRadius: 999,
        overflow: "hidden",
        backgroundColor: "rgba(251,228,216,0.08)",
        borderWidth: 1,
        borderColor: "rgba(251,228,216,0.08)",
      }}
    >
      <View
        style={{
          width: percentWidth(value),
          height: "100%",
          borderRadius: 999,
          backgroundColor: colors.ctaCream,
        }}
      />
    </View>
  );
}

function ClosetHealthCard({ insights }: { insights: WardrobeInsights }) {
  const { colors } = useAppTheme();
  const inventoryValue = insights.inventoryValue.hasValue
    ? formatCurrency(
        insights.inventoryValue.totalEstimatedValue,
        insights.inventoryValue.currency,
        true
      )
    : "Add prices";

  return (
    <Card title="Closet Health Score" eyebrow="WARDROBE READ" warm>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <Text
            selectable
            style={{
              color: colors.text,
              fontSize: 56,
              lineHeight: 60,
              fontWeight: "900",
              letterSpacing: 0,
              fontVariant: ["tabular-nums"],
            }}
          >
            {insights.closetHealthScore}
          </Text>
          <Text
            selectable
            style={{
              color: colors.textSecondary,
              fontSize: 18,
              lineHeight: 30,
              fontWeight: "800",
              letterSpacing: 0,
            }}
          >
            / 100
          </Text>
        </View>

        <Text
          style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}
        >
          {insights.closetHealthInsight}
        </Text>

        <ProgressBar value={insights.closetHealthScore} colors={colors} />

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
          <StatTile label="Items" value={formatCount(insights.totalItemCount)} />
          <StatTile label="Outfit range" value={formatCount(insights.estimatedOutfitPotential)} />
          <StatTile label="Inventory value" value={inventoryValue} accent />
          <StatTile label="Planned / worn" value={formatCount(insights.plannedOrWornCount)} />
        </View>
      </View>
    </Card>
  );
}

function InventoryValueCard({ insights }: { insights: WardrobeInsights }) {
  const { colors } = useAppTheme();
  const value = insights.inventoryValue;

  return (
    <Card title="Inventory value" eyebrow="ASSET VIEW">
      {value.hasValue ? (
        <View style={{ gap: 14 }}>
          <View
            style={{
              borderRadius: 22,
              padding: 16,
              backgroundColor: INSIGHTS_ACCENT_SURFACE,
              borderWidth: 1,
              borderColor: colors.borderWarm,
              gap: 5,
            }}
          >
            <Text
              selectable
              style={{
                color: colors.text,
                fontSize: 34,
                lineHeight: 40,
                fontWeight: "900",
                letterSpacing: 0,
                fontVariant: ["tabular-nums"],
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCurrency(value.totalEstimatedValue, value.currency)}
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                lineHeight: 18,
                fontWeight: "700",
                letterSpacing: 0,
              }}
            >
              Based on {formatCount(value.displayedPricedItemCount)} priced items
              {value.hasMixedCurrencies ? ` in ${value.currency}` : ""}
            </Text>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
            <StatTile label="Items with value" value={formatCount(value.pricedItemCount)} />
            <StatTile
              label="Average item"
              value={formatCurrency(value.averageItemValue, value.currency, true)}
            />
            <StatTile label="Missing value" value={formatCount(value.unpricedItemCount)} />
          </View>

          <Text
            style={{
              color: colors.textSecondary,
              opacity: 0.82,
              fontSize: 12.5,
              lineHeight: 18,
              fontWeight: "600",
              letterSpacing: 0,
            }}
          >
            {value.hasMixedCurrencies
              ? `${formatCount(value.otherCurrencyItemCount)} priced items use another currency and are not included yet. Add prices to improve this estimate.`
              : "Add prices to improve this estimate."}
          </Text>
        </View>
      ) : (
        <View
          style={{
            borderRadius: 20,
            padding: 16,
            backgroundColor: INSIGHTS_SOFT_SURFACE,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 6,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 16,
              lineHeight: 21,
              fontWeight: "900",
              letterSpacing: 0,
            }}
          >
            Add item prices to estimate your closet value.
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 13,
              lineHeight: 19,
              fontWeight: "500",
              letterSpacing: 0,
            }}
          >
            AURA will show total worth, average value, and missing prices once items have values.
          </Text>
        </View>
      )}
    </Card>
  );
}

function CategoryBar({ category }: { category: WardrobeCategoryInsight }) {
  const { colors } = useAppTheme();

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 13.5,
            lineHeight: 18,
            fontWeight: "800",
            letterSpacing: 0,
          }}
          numberOfLines={1}
        >
          {category.label}
        </Text>
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontSize: 12,
            lineHeight: 16,
            fontWeight: "800",
            letterSpacing: 0,
            fontVariant: ["tabular-nums"],
          }}
          numberOfLines={1}
        >
          {category.count} / {category.percentage}%
        </Text>
      </View>
      <View
        style={{
          height: 8,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: INSIGHTS_SOFT_SURFACE,
        }}
      >
        <View
          style={{
            height: "100%",
            width: percentWidth(category.percentage),
            minWidth: category.count > 0 ? 8 : 0,
            borderRadius: 999,
            backgroundColor: colors.ctaCream,
          }}
        />
      </View>
    </View>
  );
}

function WardrobeMixCard({ insights }: { insights: WardrobeInsights }) {
  const { colors } = useAppTheme();

  return (
    <Card title="Wardrobe Mix" eyebrow="CATEGORY BALANCE">
      <View style={{ gap: 14 }}>
        <View style={{ gap: 13 }}>
          {insights.categories.map((category) => (
            <CategoryBar key={category.key} category={category} />
          ))}
        </View>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 13.5,
            lineHeight: 20,
            fontWeight: "600",
            letterSpacing: 0,
          }}
        >
          {insights.wardrobeMixNote}
        </Text>
      </View>
    </Card>
  );
}

function ColorIdentityCard({ insights }: { insights: WardrobeInsights }) {
  const { colors } = useAppTheme();

  return (
    <Card title="Color Identity" eyebrow="PALETTE">
      <View style={{ gap: 14 }}>
        {insights.dominantColors.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
            {insights.dominantColors.map((color) => (
              <View
                key={`${color.label}:${color.count}`}
                style={{
                  minHeight: 38,
                  borderRadius: 999,
                  paddingLeft: 8,
                  paddingRight: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: INSIGHTS_SOFT_SURFACE,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    backgroundColor: color.hex,
                    borderWidth: 1,
                    borderColor: "rgba(251,228,216,0.36)",
                  }}
                />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 12.5,
                    lineHeight: 16,
                    fontWeight: "900",
                    letterSpacing: 0,
                  }}
                  numberOfLines={1}
                >
                  {color.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 13.5,
            lineHeight: 20,
            fontWeight: "600",
            letterSpacing: 0,
          }}
        >
          {insights.colorIdentityText}
        </Text>
      </View>
    </Card>
  );
}

function PieceImage({ item }: { item: ClothingItem }) {
  const { colors } = useAppTheme();
  const imageSource = useMemo(() => getBestThumbnailImageSource(item), [item]);
  const imagePresentation = useMemo(
    () => getItemImagePresentation(item, { surface: "home_continue" }),
    [item]
  );

  return (
    <View
      style={{
        width: 58,
        height: 68,
        borderRadius: 16,
        backgroundColor: colors.boardLight,
        borderWidth: 1,
        borderColor: "rgba(25,0,25,0.08)",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        padding: 6,
      }}
    >
      {imageSource ? (
        <AppImage
          source={imageSource}
          resizeMode="contain"
          style={[{ width: "100%", height: "100%" }, imagePresentation.imageStyle]}
        />
      ) : (
        <Ionicons name="shirt-outline" size={24} color={colors.textOnLightSecondary} />
      )}
    </View>
  );
}

function PieceRow({
  entry,
  usageAvailable,
  actionLabel,
  onAction,
}: {
  entry: WardrobeItemUseInsight;
  usageAvailable: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useAppTheme();
  const usageLabel = usageAvailable
    ? entry.usageCount > 0
      ? `${entry.usageCount} tracked use${entry.usageCount === 1 ? "" : "s"}`
      : "Ready for rotation"
    : "Closet-only signal";

  return (
    <View
      style={{
        borderRadius: 20,
        padding: 10,
        backgroundColor: INSIGHTS_SOFT_SURFACE,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <PieceImage item={entry.item} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 14,
            lineHeight: 18,
            fontWeight: "900",
            letterSpacing: 0,
          }}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {titleForItem(entry.item)}
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 12,
            lineHeight: 16,
            fontWeight: "700",
            letterSpacing: 0,
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {categoryForItem(entry.item)}
        </Text>
        <Text
          selectable
          style={{
            color: colors.ctaCream,
            fontSize: 11.5,
            lineHeight: 15,
            fontWeight: "900",
            letterSpacing: 0,
            fontVariant: ["tabular-nums"],
          }}
          numberOfLines={1}
        >
          {usageLabel}
        </Text>
      </View>

      {actionLabel && onAction ? (
        <AuraPressable
          onPress={onAction}
          haptic="selection"
          hapticTrigger="press"
          pressedScale={0.96}
          style={{
            ...auraButtonStyle(colors, "primary"),
            minHeight: 36,
            borderRadius: 999,
            paddingHorizontal: 12,
          }}
        >
          <Text
            style={[auraButtonTextStyle(colors, "primary"), { fontSize: 12, lineHeight: 16 }]}
            numberOfLines={1}
          >
            {actionLabel}
          </Text>
        </AuraPressable>
      ) : null}
    </View>
  );
}

function PiecesCard({
  title,
  eyebrow,
  entries,
  usageAvailable,
  emptyText,
  actionLabel,
  onAction,
}: {
  title: string;
  eyebrow: string;
  entries: WardrobeItemUseInsight[];
  usageAvailable: boolean;
  emptyText: string;
  actionLabel?: string;
  onAction?: (entry: WardrobeItemUseInsight) => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Card title={title} eyebrow={eyebrow}>
      {entries.length ? (
        <View style={{ gap: 10 }}>
          {entries.map((entry) => (
            <PieceRow
              key={entry.item.id}
              entry={entry}
              usageAvailable={usageAvailable}
              actionLabel={actionLabel}
              onAction={onAction ? () => onAction(entry) : undefined}
            />
          ))}
        </View>
      ) : (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 13.5,
            lineHeight: 20,
            fontWeight: "600",
            letterSpacing: 0,
          }}
        >
          {emptyText}
        </Text>
      )}
    </Card>
  );
}

function MissingPiecesCard({
  insights,
  onAskAuraWhatToBuy,
}: {
  insights: WardrobeInsights;
  onAskAuraWhatToBuy: (missingPieces: MissingPieceInsight[]) => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Card title="What would unlock more outfits" eyebrow="MISSING PIECES">
      <View style={{ gap: 14 }}>
        {insights.missingPieces.length ? (
          <View style={{ gap: 9 }}>
            {insights.missingPieces.map((piece) => (
              <View
                key={piece.key}
                style={{
                  borderRadius: 18,
                  paddingVertical: 11,
                  paddingHorizontal: 12,
                  backgroundColor: INSIGHTS_SOFT_SURFACE,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.purpleSurface,
                    borderWidth: 1,
                    borderColor: colors.purpleBorder,
                  }}
                >
                  <Ionicons name="add" size={16} color={colors.ctaCream} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13.5,
                      lineHeight: 18,
                      fontWeight: "900",
                      letterSpacing: 0,
                    }}
                    numberOfLines={1}
                  >
                    {piece.label}
                  </Text>
                  <Text
                    selectable
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12,
                      lineHeight: 16,
                      fontWeight: "700",
                      letterSpacing: 0,
                      fontVariant: ["tabular-nums"],
                    }}
                    numberOfLines={1}
                  >
                    {piece.count}/{piece.target} owned - add {piece.missingCount}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 13.5,
              lineHeight: 20,
              fontWeight: "600",
              letterSpacing: 0,
            }}
          >
            Your foundation is covered. AURA can now focus on sharper upgrades instead of basics.
          </Text>
        )}

        <AuraPressable
          onPress={() => onAskAuraWhatToBuy(insights.missingPieces)}
          haptic="selection"
          hapticTrigger="press"
          pressedScale={0.97}
          style={{
            ...auraButtonStyle(colors, "primary"),
            minHeight: 46,
            borderRadius: 999,
            paddingHorizontal: 16,
            alignSelf: "flex-start",
            flexDirection: "row",
            gap: 8,
          }}
        >
          <Ionicons name="sparkles-outline" size={15} color={colors.ctaText} />
          <Text
            style={[auraButtonTextStyle(colors, "primary"), { fontSize: 13, lineHeight: 17 }]}
            numberOfLines={1}
          >
            Ask AURA what to buy
          </Text>
        </AuraPressable>
      </View>
    </Card>
  );
}

export default function AuraInsightsDashboard({
  insights,
  loading = false,
  period,
  onPeriodChange,
  onBack,
  onStyleItem,
  onAskAuraWhatToBuy,
}: AuraInsightsDashboardProps) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: INSIGHTS_BACKGROUND,
        }}
      >
        <AuraSubpageHeader
          title="Insights"
          eyebrow="AURA INSIGHTS"
          onBack={onBack}
          fallbackRoute="/"
        />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator color={colors.text} />
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              lineHeight: 20,
              fontWeight: "600",
              letterSpacing: 0,
            }}
          >
            Decoding your closet...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: INSIGHTS_BACKGROUND }}>
      <AuraSubpageHeader
        title="Insights"
        eyebrow="AURA INSIGHTS"
        onBack={onBack}
        fallbackRoute="/"
      />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 12,
          paddingHorizontal: layout.horizontalPadding,
          paddingBottom: layout.bottomDockPadding + 44,
          gap: 16,
        }}
      >
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
            {INSIGHT_PERIOD_OPTIONS.map((option) => (
              <PeriodChip
                key={option.key}
                label={option.label}
                selected={period === option.key}
                onPress={() => onPeriodChange(option.key)}
              />
            ))}
          </View>
        </View>

        <ClosetHealthCard insights={insights} />
        <InventoryValueCard insights={insights} />
        <WardrobeMixCard insights={insights} />
        <ColorIdentityCard insights={insights} />
        <PiecesCard
          title="MVP Pieces"
          eyebrow="MOST USEFUL"
          entries={insights.mostUsefulItems}
          usageAvailable={insights.usageAvailable}
          emptyText="Add a few pieces and planned looks so AURA can identify the wardrobe workhorses."
        />
        <PiecesCard
          title="Revive Pieces"
          eyebrow="QUIETLY WAITING"
          entries={insights.underusedItems}
          usageAvailable={insights.usageAvailable}
          emptyText="No revive picks yet. Once your closet has more pieces, AURA will surface what deserves another look."
          actionLabel="Style this"
          onAction={(entry) => onStyleItem(entry.item)}
        />
        <MissingPiecesCard insights={insights} onAskAuraWhatToBuy={onAskAuraWhatToBuy} />
      </ScrollView>
    </View>
  );
}
