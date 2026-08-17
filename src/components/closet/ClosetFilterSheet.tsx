import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Modal, Pressable, ScrollView, Text, View } from "react-native";

import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraCardStyle,
  auraChipStyle,
  auraChipTextStyle,
  auraSheetBackdropStyle,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export type ClosetFilterOption = {
  key: string;
  label: string;
};

export type ClosetColorFilterOption = ClosetFilterOption;
export type ClosetSortOption = ClosetFilterOption;

const SWATCH_COLORS: Record<string, string> = {
  black: "#111113",
  white: "#F4EFE8",
  ivory: "#EFE6D8",
  cream: "#EADCC8",
  beige: "#CDBB9A",
  tan: "#B7956A",
  brown: "#6A4229",
  grey: "#8F8D91",
  gray: "#8F8D91",
  charcoal: "#3E3D42",
  blue: "#315D9D",
  navy: "#162846",
  denim: "#406D9F",
  green: "#3D7050",
  olive: "#687044",
  red: "#A83535",
  burgundy: "#6D2433",
  pink: "#D78DA5",
  purple: "#75539A",
  yellow: "#D8B847",
  orange: "#C87532",
  gold: "#B99542",
  silver: "#B8B8BD",
};

function swatchColorFor(key: string) {
  const normalized = key.toLowerCase();
  return (
    SWATCH_COLORS[normalized] ??
    Object.entries(SWATCH_COLORS).find(([token]) => normalized.includes(token))?.[1] ??
    "#8F8D91"
  );
}

function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 11 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={[auraTypography.caption, { color: colors.textSecondary, fontSize: 12.5, lineHeight: 16, fontWeight: "500", letterSpacing: 1.15, textTransform: "uppercase" }]}>
          {title}
        </Text>
        {detail ? (
          <Text style={[auraTypography.caption, { color: colors.textSecondary, fontSize: 11.5, lineHeight: 15 }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {children}
      </View>
    </View>
  );
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        ...auraChipStyle(colors, active ? "selected" : "filter"),
        flexDirection: "row",
        gap: 6,
        minHeight: 38,
        minWidth: 92,
        paddingHorizontal: 12,
        backgroundColor: active ? colors.accentSoft : colors.surfaceMuted,
        borderColor: active ? colors.borderStrong : colors.border,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      {active ? <Ionicons name="checkmark" size={13} color={colors.ctaCream} /> : null}
      <Text
        style={{
          ...auraChipTextStyle(colors, active ? "selected" : "filter"),
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MulticolorSwatch() {
  return (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(251,228,216,0.28)",
        flexDirection: "row",
      }}
    >
      <View style={{ flex: 1, backgroundColor: "#A83535" }} />
      <View style={{ flex: 1, backgroundColor: "#315D9D" }} />
      <View style={{ flex: 1, backgroundColor: "#D8B847" }} />
    </View>
  );
}

function ColorPill({
  option,
  active,
  multicolor,
  onPress,
}: {
  option: ClosetColorFilterOption;
  active: boolean;
  multicolor?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        ...auraChipStyle(colors, active ? "selected" : "filter"),
        flexDirection: "row",
        gap: 8,
        minHeight: 38,
        minWidth: 104,
        paddingHorizontal: 12,
        backgroundColor: active ? colors.accentSoft : colors.surfaceMuted,
        borderColor: active ? colors.borderStrong : colors.border,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      {multicolor ? (
        <MulticolorSwatch />
      ) : (
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "rgba(251,228,216,0.24)",
            backgroundColor: swatchColorFor(option.key),
          }}
        />
      )}
      <Text
        style={{
          ...auraChipTextStyle(colors, active ? "selected" : "filter"),
        }}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

export function ClosetFilterSheet({
  visible,
  onClose,
  statusFilter,
  categoryFilter,
  brandFilter,
  colorFilters,
  sortMode,
  sortOptions,
  statusOptions,
  categoryOptions,
  brandOptions,
  colorOptions,
  multicolorFilterKey,
  styleOptions = [],
  selectedStyleFilters = [],
  wearOptions = [],
  selectedWearFilters = [],
  onChangeStatus,
  onChangeCategory,
  onChangeBrand,
  onChangeSort,
  onToggleColor,
  onClearColors,
  onToggleStyle,
  onClearStyle,
  onToggleWear,
  onClearWear,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  statusFilter: string;
  categoryFilter: string;
  brandFilter: string;
  colorFilters: string[];
  sortMode: string;
  sortOptions: ClosetSortOption[];
  statusOptions: ClosetFilterOption[];
  categoryOptions: ClosetFilterOption[];
  brandOptions: string[];
  colorOptions: ClosetColorFilterOption[];
  multicolorFilterKey: string;
  styleOptions?: ClosetFilterOption[];
  selectedStyleFilters?: string[];
  wearOptions?: ClosetFilterOption[];
  selectedWearFilters?: string[];
  onChangeStatus: (value: string) => void;
  onChangeCategory: (value: string) => void;
  onChangeBrand: (value: string) => void;
  onChangeSort: (value: string) => void;
  onToggleColor: (value: string) => void;
  onClearColors: () => void;
  onToggleStyle: (value: string) => void;
  onClearStyle: () => void;
  onToggleWear: (value: string) => void;
  onClearWear: () => void;
  onClear: () => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const translateY = useRef(new Animated.Value(420)).current;
  const hasStyleOptions = styleOptions.length > 0;
  const hasWearOptions = wearOptions.length > 0;

  useEffect(() => {
    if (!visible) return;
    Animated.timing(translateY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [translateY, visible]);

  const closeWithAnimation = useMemo(
    () => () => {
      Animated.timing(translateY, {
        toValue: 420,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onClose();
      });
    },
    [onClose, translateY]
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeWithAnimation}>
      <Pressable
        onPress={closeWithAnimation}
        style={{
          ...auraSheetBackdropStyle(colors),
          backgroundColor: colors.overlay,
        }}
      >
        <Animated.View
          onStartShouldSetResponder={() => true}
          style={{
            transform: [{ translateY }],
            maxHeight: "86%",
            ...auraCardStyle(colors, "sheet"),
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.borderStrong,
            borderTopWidth: 1,
            borderTopColor: colors.borderStrong,
            borderTopLeftRadius: layout.largeRadius,
            borderTopRightRadius: layout.largeRadius,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            paddingHorizontal: layout.horizontalPadding,
            paddingTop: 10,
            paddingBottom: Math.max(20, layout.floatingDockBottom + 10),
            gap: 14,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 42,
              height: 5,
              borderRadius: 999,
              backgroundColor: colors.borderStrong,
            }}
          />

          <View style={{ gap: 2 }}>
            <View style={{ gap: 2 }}>
              <Text style={[auraTypography.sectionTitle, { color: colors.text }]}>
                Organize closet
              </Text>
              <Text style={[auraTypography.caption, { color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 }]}>
                Sort and refine what is visible.
              </Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 22, paddingBottom: 8 }}>
            <Section title="Sort">
              {sortOptions.map((option) => (
                <FilterPill
                  key={option.key}
                  label={option.label}
                  active={sortMode === option.key}
                  onPress={() => onChangeSort(option.key)}
                />
              ))}
            </Section>

            <View style={{ height: 1, backgroundColor: colors.borderSoft }} />

            <Text style={[auraTypography.caption, { color: colors.textMuted, fontSize: 11.5, lineHeight: 15, fontWeight: "500", letterSpacing: 1.15, textTransform: "uppercase" }]}>
              Filters
            </Text>

            <Section title="Status">
              {statusOptions.map((option) => (
                <FilterPill
                  key={option.key}
                  label={option.label}
                  active={statusFilter === option.key}
                  onPress={() => onChangeStatus(option.key)}
                />
              ))}
            </Section>

            <Section title="Category">
              {categoryOptions.map((option) => (
                <FilterPill
                  key={option.key}
                  label={option.label}
                  active={categoryFilter === option.key}
                  onPress={() => onChangeCategory(option.key)}
                />
              ))}
            </Section>

            <Section title="Brand">
              {brandOptions.slice(0, 28).map((option) => (
                <FilterPill
                  key={option}
                  label={option === "ALL" ? "All brands" : option}
                  active={brandFilter === option}
                  onPress={() => onChangeBrand(option)}
                />
              ))}
            </Section>

            <Section title="Color" detail={colorFilters.length ? `${colorFilters.length} selected` : undefined}>
              <FilterPill label="All colors" active={colorFilters.length === 0} onPress={onClearColors} />
              <ColorPill
                option={{ key: multicolorFilterKey, label: "Multicolor" }}
                multicolor
                active={colorFilters.includes(multicolorFilterKey)}
                onPress={() => onToggleColor(multicolorFilterKey)}
              />
              {colorOptions.slice(0, 30).map((option) => (
                <ColorPill
                  key={option.key}
                  option={option}
                  active={colorFilters.includes(option.key)}
                  onPress={() => onToggleColor(option.key)}
                />
              ))}
            </Section>

            {hasStyleOptions ? (
              <Section title="Fit / style" detail={selectedStyleFilters.length ? `${selectedStyleFilters.length} selected` : undefined}>
                <FilterPill label="All styles" active={selectedStyleFilters.length === 0} onPress={onClearStyle} />
                {styleOptions.map((option) => (
                  <FilterPill
                    key={option.key}
                    label={option.label}
                    active={selectedStyleFilters.includes(option.key)}
                    onPress={() => onToggleStyle(option.key)}
                  />
                ))}
              </Section>
            ) : null}

            {hasWearOptions ? (
              <Section title="Laundry / wear" detail={selectedWearFilters.length ? `${selectedWearFilters.length} selected` : undefined}>
                <FilterPill label="Any wear" active={selectedWearFilters.length === 0} onPress={onClearWear} />
                {wearOptions.map((option) => (
                  <FilterPill
                    key={option.key}
                    label={option.label}
                    active={selectedWearFilters.includes(option.key)}
                    onPress={() => onToggleWear(option.key)}
                  />
                ))}
              </Section>
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onClear}
              style={({ pressed }) => ({
                flex: 1,
                ...auraButtonStyle(colors, "secondary"),
                minHeight: 48,
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <Text style={[auraButtonTextStyle(colors, "secondary"), { fontSize: 14 }]}>Clear filters</Text>
            </Pressable>
            <Pressable
              onPress={closeWithAnimation}
              style={({ pressed }) => ({
                flex: 1,
                ...auraButtonStyle(colors, "primary"),
                minHeight: 48,
                opacity: pressed ? 0.86 : 1,
              })}
            >
              <Text style={[auraButtonTextStyle(colors, "primary"), { fontSize: 14 }]}>Done</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
