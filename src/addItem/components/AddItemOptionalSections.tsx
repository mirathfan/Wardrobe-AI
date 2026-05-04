import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { Category } from "../../shared/wardrobeTaxonomy";
import { titleCaseLabel } from "../controllerShared";
import { Field } from "../ui/Field";
import { MemoTextInputField } from "../ui/MemoTextInputField";
import { SectionCard } from "../ui/SectionCard";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const AddItemOptionalSections = React.memo(function AddItemOptionalSections({
  controller,
}: {
  controller: any;
}) {
  const { state, derived, actions } = controller;
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    actions.setAdvancedExpanded(true);
    actions.setFabricExpanded(Boolean(state.material || state.pattern));
    actions.setSizeExpanded(Boolean(state.size || state.priceAmount || state.purchaseDate || state.sourceUrl));
    actions.setOccasionExpanded(state.occasionTags.length > 0);
    actions.setSeasonExpanded(state.seasonTags.length > 0 || state.warmthPreference != null);
    actions.setFitExpanded(Boolean(state.fit || state.rise || state.legShape));
    actions.setNotesExpanded(Boolean(state.notes));
  }, [actions, state.fit, state.legShape, state.material, state.notes, state.occasionTags.length, state.pattern, state.priceAmount, state.purchaseDate, state.rise, state.seasonTags.length, state.size, state.sourceUrl, state.warmthPreference]);

  return (
    <View style={{ gap: 12 }}>
      <OptionalCard
        title="Fabric & style"
        summary={summaryText([state.material, state.pattern])}
        expanded={state.fabricExpanded}
        onPress={() => actions.toggleSection("fabric")}
      >
        <View style={{ gap: 10 }}>
          <PickerRow label="Material" value={derived.displayedMaterial} onPress={() => actions.setShowAttributeSheet("material")} />
          <PickerRow label="Pattern" value={derived.displayedPattern} onPress={() => actions.setShowAttributeSheet("pattern")} />
        </View>
      </OptionalCard>

      <OptionalCard
        title="Size & purchase"
        summary={summaryText([
          state.size,
          state.priceDisplay || (state.priceAmount ? `${state.priceCurrency} ${state.priceAmount}` : ""),
          state.purchaseDate,
        ])}
        expanded={state.sizeExpanded}
        onPress={() => actions.toggleSection("size")}
      >
        <View style={{ gap: 12 }}>
          <Field label="Size">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {derived.SIZE_OPTIONS.map((option: string) => (
                <CompactChip
                  key={option}
                  label={option}
                  active={state.size === option}
                  onPress={() => {
                    actions.markUserEdited("size");
                    actions.setSize(state.size === option ? "" : option);
                  }}
                />
              ))}
            </View>
          </Field>
          <Field label="Custom size">
            <MemoTextInputField
              value={state.size}
              onCommit={(value) => {
                actions.markUserEdited("size");
                actions.setSize(value);
              }}
              placeholder="e.g., M, 32 / 30, EU 42"
            />
          </Field>
          <Field
            label="Price"
            right={
              state.priceSource ? (
                <Text style={{ color: "#DFB6B2", fontSize: 12, lineHeight: 17, fontWeight: "800" }}>
                  {state.priceSource === "product_link" ? "Product link" : "Manual"}
                </Text>
              ) : null
            }
          >
            <View style={{ flexDirection: "row", gap: 8 }}>
              <MemoTextInputField
                value={state.priceAmount}
                onCommit={(value) => {
                  actions.markUserEdited("price");
                  actions.setPriceAmount(value);
                  actions.setPriceSource(value.trim() ? "manual" : null);
                  actions.setPriceDisplay("");
                }}
                placeholder="e.g., 220"
                keyboardType="numeric"
                containerStyle={{ flex: 1 }}
              />
              <CompactChip label={state.priceCurrency} active onPress={() => actions.setShowCurrencyPicker(true)} />
            </View>
          </Field>
          <Field label="Purchase date">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <CompactChip label="Not set" active={!state.purchaseDate} onPress={() => actions.setPurchaseDate("")} />
              <CompactChip
                label="Today"
                active={state.purchaseDate === new Date().toISOString().slice(0, 10)}
                onPress={() => actions.setPurchaseDate(new Date().toISOString().slice(0, 10))}
              />
            </View>
          </Field>
          <Field label="Product URL">
            <MemoTextInputField
              value={state.sourceUrl}
              onCommit={(value) => {
                actions.markUserEdited("sourceUrl");
                actions.setSourceUrl(value);
              }}
              placeholder="https://..."
            />
          </Field>
        </View>
      </OptionalCard>

      <OptionalCard
        title="Occasion"
        summary={summaryText(state.occasionTags.map((tag: string) => tag.replace(/_/g, " ")))}
        expanded={state.occasionExpanded}
        onPress={() => actions.toggleSection("occasion")}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {derived.OCCASION_OPTIONS.map((option: string) => (
            <CompactChip
              key={option}
              label={titleCaseLabel(option)}
              active={state.occasionTags.includes(option)}
              onPress={() => {
                actions.markUserEdited("occasionTags");
                const next = state.occasionTags.includes(option)
                  ? state.occasionTags.filter((x: string) => x !== option)
                  : [...state.occasionTags, option];
                actions.setOccasionTags(next);
              }}
            />
          ))}
        </View>
      </OptionalCard>

      <OptionalCard
        title="Season & warmth"
        summary={summaryText([...state.seasonTags.map((tag: string) => tag.replace(/_/g, " ")), derived.warmthLabel !== "Auto" ? derived.warmthLabel : ""])}
        expanded={state.seasonExpanded}
        onPress={() => actions.toggleSection("season")}
      >
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {derived.SEASON_OPTIONS.map((option: string) => (
              <CompactChip
                key={option}
                label={titleCaseLabel(option)}
                active={state.seasonTags.includes(option)}
                onPress={() => {
                  actions.markUserEdited("seasonTags");
                  const next = state.seasonTags.includes(option)
                    ? state.seasonTags.filter((x: string) => x !== option)
                    : [...state.seasonTags, option];
                  actions.setSeasonTags(next);
                }}
              />
            ))}
          </View>
          <Field label="Warmth" right={<Text style={{ color: "#DFB6B2", fontSize: 12, fontWeight: "900" }}>{derived.warmthLabel}</Text>}>
            <View style={{ gap: 6 }}>
              <Slider
                value={state.warmthPreference ?? 0.5}
                minimumValue={0}
                maximumValue={1}
                step={0.05}
                onValueChange={(value) => {
                  actions.markUserEdited("warmthPreference");
                  actions.setWarmthPreference(value);
                }}
                minimumTrackTintColor="#DFB6B2"
                maximumTrackTintColor="rgba(251,228,216,0.14)"
                thumbTintColor="#DFB6B2"
              />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <HintText label="Light" />
                <HintText label="Warm" />
              </View>
            </View>
          </Field>
        </View>
      </OptionalCard>

      <OptionalCard
        title="Fit & silhouette"
        summary={summaryText([state.fit, state.rise, state.legShape])}
        expanded={state.fitExpanded}
        onPress={() => actions.toggleSection("fit")}
      >
        <View style={{ gap: 12 }}>
          <Field label="Fit">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {derived.FIT_OPTIONS.map((option: string) => (
                <CompactChip
                  key={option}
                  label={titleCaseLabel(option)}
                  active={state.fit === option}
                  onPress={() => {
                    actions.markUserEdited("fit");
                    actions.setFit(state.fit === option ? null : option);
                  }}
                />
              ))}
            </View>
          </Field>
          {derived.selectedCategory === Category.BOTTOM ? (
            <>
              <Field label="Rise">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {derived.RISE_OPTIONS.map((option: string) => (
                    <CompactChip
                      key={option}
                      label={titleCaseLabel(option)}
                      active={state.rise === option}
                      onPress={() => {
                        actions.markUserEdited("rise");
                        actions.setRise(state.rise === option ? null : option);
                      }}
                    />
                  ))}
                </View>
              </Field>
              <Field label="Leg shape">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {derived.LEG_SHAPE_OPTIONS.map((option: string) => (
                    <CompactChip
                      key={option}
                      label={titleCaseLabel(option)}
                      active={state.legShape === option}
                      onPress={() => {
                        actions.markUserEdited("legShape");
                        actions.setLegShape(state.legShape === option ? null : option);
                      }}
                    />
                  ))}
                </View>
              </Field>
            </>
          ) : null}
        </View>
      </OptionalCard>

      <OptionalCard
        title="Notes"
        summary={state.notes ? "Notes added" : "Optional"}
        expanded={state.notesExpanded}
        onPress={() => actions.toggleSection("notes")}
      >
        <Field label="Notes">
          <MemoTextInputField
            value={state.notes}
            onCommit={actions.setNotes}
            placeholder="e.g., Limited edition, gift from friend..."
            multiline
            containerStyle={{ minHeight: 90 }}
            inputStyle={{ minHeight: 90, textAlignVertical: "top" }}
          />
        </Field>
      </OptionalCard>
    </View>
  );
});

function summaryText(values: (string | null | undefined)[]) {
  const summary = values
    .map((value) => String(value ?? "").trim().replace(/_/g, " "))
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  return summary || "Optional";
}

const OptionalCard = React.memo(function OptionalCard({
  title,
  summary,
  expanded,
  onPress,
  children,
}: {
  title: string;
  summary: string;
  expanded: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();

  return (
    <SectionCard>
      <View style={{ gap: expanded ? 13 : 0 }}>
        <Pressable
          onPress={onPress}
          hitSlop={4}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            opacity: pressed ? 0.76 : 1,
          })}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "900" }} numberOfLines={1}>
              {title}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }} numberOfLines={1}>
              {summary}
            </Text>
          </View>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.chipBackground,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} />
          </View>
        </Pressable>
        {expanded ? <View style={{ gap: 12 }}>{children}</View> : null}
      </View>
    </SectionCard>
  );
});

const PickerRow = React.memo(function PickerRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        backgroundColor: colors.inputBackground,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: "900", color: colors.text }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1, justifyContent: "flex-end" }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={1}>
          {value || "Auto"}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
});

const CompactChip = React.memo(function CompactChip({
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
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: 40,
        justifyContent: "center",
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? colors.purpleBorder : colors.border,
        backgroundColor: active ? colors.purpleSurface : colors.chipBackground,
        opacity: pressed ? 0.76 : 1,
      })}
    >
      <Text
        style={{
          color: active ? colors.ctaCream : colors.textSecondary,
          fontSize: 12.5,
          lineHeight: 16,
          fontWeight: "900",
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const HintText = React.memo(function HintText({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16 }}>{label}</Text>;
});
