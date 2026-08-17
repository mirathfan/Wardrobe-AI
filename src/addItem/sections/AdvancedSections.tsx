import React from "react";
import { Pressable, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { Category } from "../../shared/wardrobeTaxonomy";
import { ChipRow } from "../ui/ChipRow";
import { CollapsibleHeader } from "../ui/CollapsibleHeader";
import { Field } from "../ui/Field";
import { MemoTextInputField } from "../ui/MemoTextInputField";
import { Pill } from "../ui/Pill";
import { SectionCard } from "../ui/SectionCard";
import { makeDevThrottleLogger } from "../devPerf";
import { useAppTheme } from "@/src/hooks/useAppTheme";

const logAdvancedRender = makeDevThrottleLogger("AdvancedSections");

export const AdvancedToggleRow = React.memo(function AdvancedToggleRow({ controller }: { controller: any }) {
  const { state, actions } = controller;
  logAdvancedRender({ row: "advanced-toggle", expanded: state.advancedExpanded });
  return (
    <SectionCard>
      <CollapsibleHeader
        title="Advanced"
        expanded={state.advancedExpanded}
        onPress={() => {
          actions.setFabricExpanded(false);
          actions.setSizeExpanded(false);
          actions.setOccasionExpanded(false);
          actions.setSeasonExpanded(false);
          actions.setFitExpanded(false);
          actions.setNotesExpanded(false);
          actions.setAdvancedExpanded(!state.advancedExpanded);
        }}
      />
    </SectionCard>
  );
});

export const FabricHeaderRow = React.memo(function FabricHeaderRow({ controller }: { controller: any }) {
  const { state, actions } = controller;
  logAdvancedRender({ row: "fabric-header", expanded: state.fabricExpanded });
  return (
    <SectionCard>
      <CollapsibleHeader
        title="Fabric & Style"
        expanded={state.fabricExpanded}
        onPress={() => actions.toggleSection("fabric")}
      />
    </SectionCard>
  );
});

export const FabricContentRow = React.memo(function FabricContentRow({ controller }: { controller: any }) {
  const { state, derived, actions } = controller;
  logAdvancedRender({ row: "fabric-content", material: !!state.material, pattern: !!state.pattern });
  return (
    <SectionCard>
      <View style={{ gap: 12 }}>
        <PickerRow label="Material" value={derived.displayedMaterial} onPress={() => actions.setShowAttributeSheet("material")} />
        <PickerRow label="Pattern" value={derived.displayedPattern} onPress={() => actions.setShowAttributeSheet("pattern")} />
      </View>
    </SectionCard>
  );
});

export const SizeHeaderRow = React.memo(function SizeHeaderRow({ controller }: { controller: any }) {
  const { state, actions } = controller;
  logAdvancedRender({ row: "size-header", expanded: state.sizeExpanded });
  return (
    <SectionCard>
      <CollapsibleHeader title="Size & Purchase" expanded={state.sizeExpanded} onPress={() => actions.toggleSection("size")} />
    </SectionCard>
  );
});

export const SizeContentRow = React.memo(function SizeContentRow({ controller }: { controller: any }) {
  const { state, derived, actions } = controller;
  const { colors } = useAppTheme();
  logAdvancedRender({ row: "size-content", size: !!state.size, price: !!state.priceAmount });
  const priceNote =
    state.priceSource === "product_link"
      ? "From product link"
      : state.priceAmount
        ? "Manual"
        : "";
  return (
    <SectionCard>
      <View style={{ gap: 12 }}>
        <Field label="Size">
          <ChipRow>
            {derived.SIZE_OPTIONS.map((option: string) => (
              <Pill
                key={option}
                label={option}
                active={state.size === option}
                onPress={() => {
                  actions.markUserEdited("size");
                  actions.setSize(state.size === option ? "" : option);
                }}
              />
            ))}
          </ChipRow>
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
            priceNote ? (
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>
                {priceNote}
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
            <Pill label={state.priceCurrency} active={true} onPress={() => actions.setShowCurrencyPicker(true)} />
          </View>
        </Field>
        <Field label="Purchase date">
          <ChipRow>
            <Pill label="Not set" active={!state.purchaseDate} onPress={() => actions.setPurchaseDate("")} />
            <Pill
              label="Today"
              active={state.purchaseDate === new Date().toISOString().slice(0, 10)}
              onPress={() => actions.setPurchaseDate(new Date().toISOString().slice(0, 10))}
            />
          </ChipRow>
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
    </SectionCard>
  );
});

export const OccasionHeaderRow = React.memo(function OccasionHeaderRow({ controller }: { controller: any }) {
  const { state, actions } = controller;
  logAdvancedRender({ row: "occasion-header", expanded: state.occasionExpanded });
  return (
    <SectionCard>
      <CollapsibleHeader title="Occasion" expanded={state.occasionExpanded} onPress={() => actions.toggleSection("occasion")} />
    </SectionCard>
  );
});

export const OccasionContentRow = React.memo(function OccasionContentRow({ controller }: { controller: any }) {
  const { state, derived, actions } = controller;
  logAdvancedRender({ row: "occasion-content", count: state.occasionTags.length });
  return (
    <SectionCard>
      <ChipRow>
        {derived.OCCASION_OPTIONS.map((option: string) => (
          <Pill
            key={option}
            label={option.replace(/_/g, " ")}
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
      </ChipRow>
    </SectionCard>
  );
});

export const SeasonHeaderRow = React.memo(function SeasonHeaderRow({ controller }: { controller: any }) {
  const { state, actions } = controller;
  logAdvancedRender({ row: "season-header", expanded: state.seasonExpanded });
  return (
    <SectionCard>
      <CollapsibleHeader
        title="Season & Warmth"
        expanded={state.seasonExpanded}
        onPress={() => actions.toggleSection("season")}
      />
    </SectionCard>
  );
});

export const SeasonContentRow = React.memo(function SeasonContentRow({ controller }: { controller: any }) {
  const { state, derived, actions } = controller;
  const { colors } = useAppTheme();
  logAdvancedRender({ row: "season-content", count: state.seasonTags.length });
  return (
    <SectionCard>
      <View style={{ gap: 12 }}>
        <ChipRow>
          {derived.SEASON_OPTIONS.map((option: string) => (
            <Pill
              key={option}
              label={option.replace(/_/g, " ")}
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
        </ChipRow>
        <Field label="Warmth" right={<Text style={{ color: colors.textSecondary, fontWeight: "800" }}>{derived.warmthLabel}</Text>}>
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
              minimumTrackTintColor={colors.ctaCream}
              maximumTrackTintColor={colors.borderStrong}
              thumbTintColor={colors.ctaCream}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Light</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Warm</Text>
            </View>
          </View>
        </Field>
      </View>
    </SectionCard>
  );
});

export const FitHeaderRow = React.memo(function FitHeaderRow({ controller }: { controller: any }) {
  const { state, actions } = controller;
  logAdvancedRender({ row: "fit-header", expanded: state.fitExpanded });
  return (
    <SectionCard>
      <CollapsibleHeader title="Fit & Silhouette" expanded={state.fitExpanded} onPress={() => actions.toggleSection("fit")} />
    </SectionCard>
  );
});

export const FitContentRow = React.memo(function FitContentRow({ controller }: { controller: any }) {
  const { state, derived, actions } = controller;
  logAdvancedRender({ row: "fit-content", fit: !!state.fit });
  return (
    <SectionCard>
      <View style={{ gap: 12 }}>
        <Field label="Fit">
          <ChipRow>
            {derived.FIT_OPTIONS.map((option: string) => (
              <Pill
                key={option}
                label={option}
                active={state.fit === option}
                onPress={() => {
                  actions.markUserEdited("fit");
                  actions.setFit(state.fit === option ? null : option);
                }}
              />
            ))}
          </ChipRow>
        </Field>
        {derived.selectedCategory === Category.BOTTOM ? (
          <>
            <Field label="Rise">
              <ChipRow>
                {derived.RISE_OPTIONS.map((option: string) => (
                  <Pill
                    key={option}
                    label={option}
                    active={state.rise === option}
                    onPress={() => {
                      actions.markUserEdited("rise");
                      actions.setRise(state.rise === option ? null : option);
                    }}
                  />
                ))}
              </ChipRow>
            </Field>
            <Field label="Leg shape">
              <ChipRow>
                {derived.LEG_SHAPE_OPTIONS.map((option: string) => (
                  <Pill
                    key={option}
                    label={option}
                    active={state.legShape === option}
                    onPress={() => {
                      actions.markUserEdited("legShape");
                      actions.setLegShape(state.legShape === option ? null : option);
                    }}
                  />
                ))}
              </ChipRow>
            </Field>
          </>
        ) : null}
      </View>
    </SectionCard>
  );
});

export const NotesHeaderRow = React.memo(function NotesHeaderRow({ controller }: { controller: any }) {
  const { state, actions } = controller;
  logAdvancedRender({ row: "notes-header", expanded: state.notesExpanded });
  return (
    <SectionCard>
      <CollapsibleHeader title="Notes" expanded={state.notesExpanded} onPress={() => actions.toggleSection("notes")} />
    </SectionCard>
  );
});

export const NotesContentRow = React.memo(function NotesContentRow({ controller }: { controller: any }) {
  const { state, actions } = controller;
  logAdvancedRender({ row: "notes-content", hasNotes: !!state.notes });
  return (
    <SectionCard>
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
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        backgroundColor: colors.inputBackground,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text }}>{label}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14 }} numberOfLines={1}>
        {value || "Auto (AI)"}  ›
      </Text>
    </Pressable>
  );
});
