import { router, useLocalSearchParams } from "expo-router";
import AppImage from "@/src/components/common/AppImage";
import { deleteDoc, deleteField, doc, onSnapshot, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  type DimensionValue,
  Dimensions,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AuraPressable from "@/src/components/aura/AuraPressable";
import { SafeScreen } from "../../../src/components/SafeScreen";
import { ALLOWED_COLORS } from "../../../src/shared/wardrobeTaxonomy";
import { useAuth } from "../../../src/hooks/useAuth";
import { useAppTheme } from "../../../src/hooks/useAppTheme";
import { useResponsiveLayout } from "../../../src/hooks/useResponsiveLayout";
import { db } from "../../../src/lib/firebase";
import { runHaptic } from "../../../src/lib/haptics";
import { getItemImageDecoration, getItemImagePresentation, getItemImageUrl } from "../../../src/lib/itemImage";
import { Toast } from "../../../src/lib/toast";
import {
  getIngestionStatus,
  LAUNDRY_STATUS_LABELS,
  markWashed as markWashedItem,
  markNeedsWash,
  normalizeLaundryStatus,
  safeMarkWorn,
  sendToLaundry,
} from "../../../src/lib/items";
import type { LaundryStatus } from "../../../src/types/ClothingItem";
import { ClothingItem } from "../../../src/types/ClothingItem";

type ItemDetails = ClothingItem & {
  id: string;
};

type DetailImageAsset = {
  uri: string;
  isPrimary: boolean;
};

function isValidUrl(value?: string | null) {
  const url = String(value ?? "").trim();
  if (!url) return false;
  return url.startsWith("file://") || /^https?:\/\//i.test(url);
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
  const sources = [
    ...(item.images ?? []),
    ...(item.photos?.images ?? []),
  ];

  for (const image of sources) {
    const isPrimary = Boolean(image?.isPrimary);
    const candidate = isPrimary
      ? getItemImageUrl(item, { variant: "hero" })
      : String(image?.cleanedUrl ?? image?.originalUrl ?? "").trim() || null;

    if (candidate && isValidUrl(candidate)) {
      next.push({
        uri: candidate,
        isPrimary,
      });
    }
  }

  const fallback = getItemImageUrl(item, { variant: "hero" });
  if (fallback && isValidUrl(fallback)) {
    next.push({ uri: fallback, isPrimary: next.length === 0 });
  }

  const deduped = dedupeImageAssets(next);
  return deduped.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

function formatDate(value?: any | null) {
  if (!value) return "—";
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }
  if (typeof value === "number") {
    return new Date(value).toLocaleDateString();
  }
  return "—";
}

function formatDateOrNotSet(value?: any | null) {
  if (!value) return "Not set";
  return formatDate(value);
}

function ingestionStatusLabel(item: ItemDetails | null | undefined) {
  const status = getIngestionStatus(item) ?? "pending";
  if (status === "done") return "done";
  if (status === "failed") return "failed";
  if (status === "processing") return "processing";
  return "pending";
}

function toTitleCase(value: string) {
  if (!value) return value;
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatValue(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : "—";
}

function QuickFact(props: { label: string; value: string; tone?: "default" | "success" | "danger" }) {
  const { label, value, tone = "default" } = props;
  const { colors } = useAppTheme();
  const valueColor =
    tone === "success" ? colors.success : tone === "danger" ? colors.danger : colors.text;
  return (
    <View
      style={{
        flexBasis: "48%",
        gap: 4,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.04)",
      }}
    >
      <Text
        style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}
      >
        {label}
      </Text>
      <Text style={{ color: valueColor, fontSize: 15, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

function SectionCard(props: {
  title: string;
  subtitle?: string | null;
  children: React.ReactNode;
}) {
  const { title, subtitle = null, children } = props;
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  return (
    <View
      style={[
        card,
        {
          borderColor: "rgba(255,255,255,0.08)",
          borderRadius: layout.mediumRadius,
          backgroundColor: "rgba(255,255,255,0.035)",
        },
      ]}
    >
      <View style={{ gap: 3, marginBottom: 12 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>{subtitle}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export default function ItemDetailsScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const uid = user?.uid ?? null;
  const { id, sourceTab } = useLocalSearchParams<{ id: string; sourceTab?: string }>();
  const itemId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);
  const resolvedSourceTab = useMemo(() => {
    const value = Array.isArray(sourceTab) ? sourceTab[0] : sourceTab;
    if (value === "closet" || value === "index" || value === "ai" || value === "calendar" || value === "profile") {
      return value;
    }
    return null;
  }, [sourceTab]);

  function navigateBackToSource() {
    if (resolvedSourceTab) {
      const destination =
        resolvedSourceTab === "index"
          ? "/"
          : (`/(tabs)/${resolvedSourceTab}` as "/(tabs)/closet" | "/(tabs)/ai" | "/(tabs)/calendar" | "/(tabs)/profile");
      router.replace({
        pathname: destination,
      });
      return;
    }
    router.back();
  }

  const [item, setItem] = useState<ItemDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [colorSaving, setColorSaving] = useState(false);
  const [colorSavedAt, setColorSavedAt] = useState<number | null>(null);
  const [detailImageOpen, setDetailImageOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [patternDraft, setPatternDraft] = useState("");
  const [materialDraft, setMaterialDraft] = useState("");
  const [footerHeight, setFooterHeight] = useState(0);
  const itemImageUri = getItemImageUrl(item, { variant: "hero" });
  const detailImages = useMemo(() => getItemDetailImages(item), [item]);
  const imagePresentation = getItemImagePresentation(item, {
    surface: "item_detail",
  });
  const imageDecoration = getItemImageDecoration(item, "item_detail");
  const footerOffset = layout.composerOffset;
  const quickFacts = item
    ? [
        { label: "Category", value: formatValue(item.category) },
        { label: "Sub-category", value: formatValue(item.subCategory) },
        { label: "Size", value: formatValue(item.size) },
        {
          label: "Laundry",
          value: LAUNDRY_STATUS_LABELS[normalizeLaundryStatus(item)],
          tone: normalizeLaundryStatus(item) === "in_laundry" ? ("danger" as const) : ("default" as const),
        },
        { label: "Last worn", value: formatDate(item.lastWornDate) },
        {
          label: "Last washed",
          value: formatDateOrNotSet(item.lastWashedAt ?? item.lastWashedDate),
        },
      ]
    : [];
  const aiFacts = item
    ? [
        {
          label: "Ingestion",
          value:
            ingestionStatusLabel(item) === "done"
              ? "Complete"
              : ingestionStatusLabel(item) === "failed"
                ? "Failed"
                : ingestionStatusLabel(item) === "processing"
                  ? "Processing"
                  : "Pending",
          tone:
            ingestionStatusLabel(item) === "done"
              ? ("success" as const)
              : ingestionStatusLabel(item) === "failed"
                ? ("danger" as const)
                : ("default" as const),
        },
        { label: "Source", value: formatValue(item.colorSource || "ai") },
        {
          label: "Classification",
          value: `${formatValue(item.category)} / ${formatValue(item.subCategory)}`,
        },
        {
          label: "Detected colors",
          value: formatValue(item.colorLabel || item.colors?.join(" / ")),
        },
      ]
    : [];

  useEffect(() => {
    if (activeImageIndex <= Math.max(detailImages.length - 1, 0)) return;
    setActiveImageIndex(0);
  }, [activeImageIndex, detailImages.length]);

  useEffect(() => {
    if (!itemImageUri) return;
    const baseUri = itemImageUri.split("?")[0]?.toLowerCase() ?? "";
    const kind = baseUri.endsWith(".png")
      ? "png"
      : baseUri.endsWith(".jpg") || baseUri.endsWith(".jpeg")
        ? "jpg"
        : "unknown";
    console.log("[ItemScreen] displaying image URI:", itemImageUri);
    console.log("[ItemScreen] displayed image suffix:", kind);
  }, [itemImageUri]);

  useEffect(() => {
    if (!item) return;
    setPatternDraft(item.pattern ?? "");
    setMaterialDraft(item.material ?? "");
    console.log("[ItemScreen] image fields:", {
      itemId: item.id,
      photos: item.photos ?? null,
      photoUrl: item.photoUrl ?? null,
      photoUri: item.photoUri ?? null,
      cleanedUrl: (item as any).cleanedUrl ?? null,
      cleanedPhotoUrl: (item as any).cleanedPhotoUrl ?? null,
      selectedImageUri: itemImageUri,
    });
  }, [item, itemImageUri]);

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
          setItem({ id: snap.id, ...(snap.data() as any) });
        }
        setLoading(false);
      },
      (err) => {
        console.log(err);
        Alert.alert("Error", err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [itemId, uid]);

  async function onMarkWorn() {
    if (!uid || !itemId) return router.replace("/(auth)/login");
    if (item?.status === "IN_LAUNDRY") return;

    try {
      setActionLoading(true);
      await safeMarkWorn(uid, itemId);
      void runHaptic("light");
      Toast.success("Marked worn", "Wear count updated.");
    } catch (e: any) {
      console.log(e);
      Toast.error("Update failed", e?.message ?? "Failed to mark item as worn");
    } finally {
      setActionLoading(false);
    }
  }

  async function onSendToLaundry() {
    if (!uid || !itemId) return router.replace("/(auth)/login");

    try {
      setActionLoading(true);
      await sendToLaundry(uid, itemId);
      void runHaptic("light");
      Toast.laundryUpdated("Piece moved to laundry.");
    } catch (e: any) {
      console.log(e);
      Toast.error("Laundry update failed", e?.message ?? "Failed to send item to laundry");
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
    } catch (e: any) {
      console.log(e);
      Toast.error("Laundry update failed", e?.message ?? "Failed to mark item as needs wash");
    } finally {
      setActionLoading(false);
    }
  }

  function onLaundryStatusPress(status: LaundryStatus) {
    if (status === "clean") {
      onConfirmWashed();
    } else if (status === "in_laundry") {
      void onSendToLaundry();
    } else {
      void onMarkNeedsWash();
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
          } catch (e: any) {
            console.log(e);
            Toast.error("Laundry update failed", e?.message ?? "Failed to mark item as washed");
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }

  async function onDelete() {
    if (!uid || !itemId) return router.replace("/(auth)/login");

    Alert.alert(
      "Delete item?",
      "This will remove the item from your wardrobe.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "users", uid, "items", itemId));
              navigateBackToSource();
            } catch (e: any) {
              console.log(e);
              Alert.alert("Error", e?.message ?? "Failed to delete");
            }
          },
        },
      ]
    );
  }

  function onEdit() {
    router.push({
      pathname: "/(tabs)/add",
      params: { editId: itemId },
    });
  }

  function onOpenOverflowMenu() {
    Alert.alert("Item actions", undefined, [
      { text: "Edit", onPress: onEdit },
      { text: "Delete", style: "destructive", onPress: onDelete },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function onSelectColor(color: string) {
    if (!uid || !itemId) return router.replace("/(auth)/login");
    try {
      setColorSaving(true);
      await updateDoc(doc(db, "users", uid, "items", itemId), {
        colors: [color],
        colorLabel: toTitleCase(color),
        primaryColor: toTitleCase(color),
        colorSource: "user",
        colorUpdatedAt: Date.now(),
        colorNeedsReview: false,
        colorConfidence: 1,
      });
      setColorSavedAt(Date.now());
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to save color");
    } finally {
      setColorSaving(false);
    }
  }

  async function onResetToAI() {
    if (!uid || !itemId) return router.replace("/(auth)/login");
    const currentIngestionStatus = ingestionStatusLabel(item);
    if (currentIngestionStatus === "processing" || currentIngestionStatus === "done") {
      Alert.alert("AI already complete", "Ingestion is already active or completed for this item.");
      return;
    }
    try {
      setColorSaving(true);
      await updateDoc(doc(db, "users", uid, "items", itemId), {
        colorSource: "ai",
        colorUpdatedAt: Date.now(),
        "ingestion.status": "pending",
        "ingestion.lastProcessedPhotoHash": deleteField(),
      });
      setColorSavedAt(Date.now());
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to reset AI color");
    } finally {
      setColorSaving(false);
    }
  }

  async function saveField(field: "pattern" | "material", value: string | null) {
    if (!uid || !itemId) return router.replace("/(auth)/login");
    try {
      await updateDoc(doc(db, "users", uid, "items", itemId), {
        [field]: value,
      });
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? `Failed to update ${field}`);
    }
  }

  return (
    <SafeScreen backgroundColor={colors.background} includeBottomInset={false}>
      <ItemImageModal
        visible={detailImageOpen}
        images={detailImages}
        initialIndex={activeImageIndex}
        onClose={() => setDetailImageOpen(false)}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 0,
          paddingBottom: footerHeight > 0 ? footerHeight + 24 : layout.bottomDockPadding + 96,
          gap: 16,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            minHeight: 40,
          }}
        >
          <Pressable
            onPress={navigateBackToSource}
            style={[pill, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[pillText, { color: colors.text }]}>Back</Text>
          </Pressable>
          <Text style={{ fontSize: 20, fontWeight: "900", color: colors.text }}>Item</Text>
          <Pressable
            onPress={onOpenOverflowMenu}
            style={[
              pill,
              {
                minWidth: 44,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[pillText, { fontSize: 20, lineHeight: 20, color: colors.text }]}>⋯</Text>
          </Pressable>
        </View>

        {loading ? (
          <Text style={{ color: colors.textSecondary }}>Loading…</Text>
        ) : !item ? (
          <Text style={{ color: colors.textSecondary }}>Item not found.</Text>
        ) : (
          <>
            <SectionCard title="Product view" subtitle="Tap the image to inspect the full asset.">
              {detailImages.length > 0 ? (
                <DetailImageCarousel
                  images={detailImages}
                  activeIndex={activeImageIndex}
                  onIndexChange={setActiveImageIndex}
                  onPressImage={() => setDetailImageOpen(true)}
                  containerAspectRatio={imagePresentation.containerAspectRatio}
                  imageStyle={imagePresentation.imageStyle}
                  imageDecoration={imageDecoration}
                />
              ) : (
                <View
                  style={{
                    height: 216,
                    borderRadius: 18,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: "800" }}>No photo</Text>
                </View>
              )}

              <View style={{ gap: 6, marginTop: 14 }}>
                <Text style={{ fontSize: 20, fontWeight: "900", color: colors.text }}>
                  {item.name || `${item.primaryColor ?? ""} ${item.category}`}
                </Text>
                {item.brand ? (
                  <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>{item.brand}</Text>
                ) : null}
                {item.colorLabel || item.colors?.length ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                    {item.colorLabel || item.colors?.join(" / ") || "—"}
                  </Text>
                ) : null}
              </View>
            </SectionCard>

            <SectionCard title="Quick facts">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {quickFacts.map((fact) => (
                  <QuickFact
                    key={fact.label}
                    label={fact.label}
                    value={fact.value}
                    tone={fact.tone}
                  />
                ))}
                <QuickFact
                  label="Wears since wash"
                  value={String(item.wearCountSinceWash ?? 0)}
                />
                {typeof item.priceAmount === "number" || typeof item.price === "number" ? (
                  <QuickFact
                    label="Price"
                    value={`${item.priceCurrency || "USD"} ${item.priceAmount ?? item.price}`}
                  />
                ) : null}
                {item.purchaseDate ? (
                  <QuickFact label="Purchased" value={item.purchaseDate} />
                ) : null}
              </View>
                {item.notes ? (
                <View style={{ marginTop: 12, gap: 4 }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12,
                      fontWeight: "700",
                      textTransform: "uppercase",
                    }}
                  >
                    Notes
                  </Text>
                  <Text style={{ color: colors.text, lineHeight: 20 }}>{item.notes}</Text>
                </View>
              ) : null}
            </SectionCard>

            <SectionCard title="Laundry status" subtitle="This feeds Closet, Home, outfit generation, and AURA chat.">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(["needs_wash", "in_laundry", "clean"] as LaundryStatus[]).map((status) => {
                  const selected = normalizeLaundryStatus(item) === status;
                  return (
                    <AuraPressable
                      key={status}
                      onPress={() => onLaundryStatusPress(status)}
                      disabled={actionLoading || selected}
                      haptic="selection"
                      hapticTrigger="press"
                      pressedScale={0.96}
                      pressedOpacity={0.84}
                      disabledOpacity={0.72}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        backgroundColor: selected ? colors.ctaCream : "rgba(255,255,255,0.045)",
                        borderWidth: selected ? 0 : 1,
                        borderColor: "rgba(255,255,255,0.1)",
                      }}
                    >
                      <Text style={{ color: selected ? colors.ctaText : colors.text, fontWeight: "900" }}>
                        {LAUNDRY_STATUS_LABELS[status]}
                      </Text>
                    </AuraPressable>
                  );
                })}
              </View>
            </SectionCard>

            <SectionCard
              title="AI details"
              subtitle="What the extraction pipeline inferred and how this item is currently classified."
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {aiFacts.map((fact) => (
                  <QuickFact
                    key={fact.label}
                    label={fact.label}
                    value={fact.value}
                    tone={fact.tone}
                  />
                ))}
              </View>
              {ingestionStatusLabel(item) === "failed" ? (
                <Text style={{ color: colors.danger, fontWeight: "700", marginTop: 12 }}>
                  Couldn&apos;t analyze, you can edit manually.
                </Text>
              ) : null}
              {item.colorNeedsReview && item.colorSource !== "user" ? (
                <View
                  style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: "rgba(242,198,109,0.45)",
                    backgroundColor: "rgba(242,198,109,0.12)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: colors.warning, fontWeight: "700", lineHeight: 20 }}>
                    Color check: AI said {item.aiColorLabel || "—"}, pixels suggest{" "}
                    {toTitleCase(item.pixelColors?.[0] || "—")}. Confirm a color below if needed.
                  </Text>
                </View>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Editable attributes"
              subtitle="Fine-tune the saved details without changing the rest of the item record."
            >
              <View style={{ gap: 16 }}>
                <View style={{ gap: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: "800" }}>Pattern</Text>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <AuraPressable
                      onPress={() => {
                        setPatternDraft("");
                        void saveField("pattern", null);
                      }}
                      haptic="selection"
                      hapticTrigger="press"
                      pressedScale={0.97}
                      style={[pill, { borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.04)" }]}
                    >
                      <Text style={[pillText, { color: colors.text }]}>Auto (AI)</Text>
                    </AuraPressable>
                    <TextInput
                      value={patternDraft}
                      onChangeText={setPatternDraft}
                      onEndEditing={() => void saveField("pattern", patternDraft.trim() || null)}
                      placeholder={item.pattern || "Auto (AI)"}
                      placeholderTextColor={colors.textSecondary}
                      style={[textInput, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.04)" }]}
                    />
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: "800" }}>Material</Text>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <AuraPressable
                      onPress={() => {
                        setMaterialDraft("");
                        void saveField("material", null);
                      }}
                      haptic="selection"
                      hapticTrigger="press"
                      pressedScale={0.97}
                      style={[pill, { borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.04)" }]}
                    >
                      <Text style={[pillText, { color: colors.text }]}>Auto (AI)</Text>
                    </AuraPressable>
                    <TextInput
                      value={materialDraft}
                      onChangeText={setMaterialDraft}
                      onEndEditing={() => void saveField("material", materialDraft.trim() || null)}
                      placeholder={item.material || "Auto (AI)"}
                      placeholderTextColor={colors.textSecondary}
                      style={[textInput, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.04)" }]}
                    />
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: "800" }}>Color correction</Text>
                  <Text style={{ color: colors.textSecondary }}>
                    Detected: {item.colorLabel || item.colors?.join(" / ") || "—"}. Tap to correct:
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {ALLOWED_COLORS.map((color) => {
                      const isSelected = (item.colors?.[0] || "").toLowerCase() === color;
                      return (
                        <Pressable
                          key={color}
                          onPress={() => onSelectColor(color)}
                          disabled={colorSaving}
                          style={{
                            paddingVertical: 7,
                            paddingHorizontal: 11,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.text : "rgba(255,255,255,0.12)",
                            backgroundColor: isSelected ? colors.text : "rgba(255,255,255,0.03)",
                            opacity: colorSaving ? 0.65 : 1,
                          }}
                        >
                          <Text
                            style={{ color: isSelected ? colors.background : colors.text, fontWeight: "700" }}
                          >
                            {toTitleCase(color)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {item.colorSource === "user" ? (
                      <AuraPressable
                        onPress={onResetToAI}
                        disabled={colorSaving}
                        haptic="selection"
                        hapticTrigger="press"
                        pressedScale={0.97}
                        disabledOpacity={0.65}
                        style={{
                          alignSelf: "flex-start",
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.18)",
                          backgroundColor: "rgba(255,255,255,0.03)",
                        }}
                      >
                        <Text style={{ color: colors.text, fontWeight: "700" }}>Reset to AI</Text>
                      </AuraPressable>
                    ) : null}
                    {colorSavedAt ? (
                      <Text style={{ color: colors.success, fontSize: 12, fontWeight: "700" }}>Saved</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </SectionCard>
          </>
        )}
      </ScrollView>
      {!loading && item ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: layout.horizontalPadding,
            paddingTop: 12,
            paddingBottom: footerOffset,
            backgroundColor: "rgba(15,15,15,0.92)",
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.08)",
            gap: 10,
          }}
          onLayout={(event) => {
            const nextHeight = Math.round(event.nativeEvent.layout.height);
            if (nextHeight !== footerHeight) {
              setFooterHeight(nextHeight);
            }
          }}
        >
          {normalizeLaundryStatus(item) === "in_laundry" ? (
            <AuraPressable
              onPress={onConfirmWashed}
              disabled={actionLoading}
              haptic="light"
              hapticTrigger="press"
              pressedScale={0.98}
              pressedOpacity={0.86}
              disabledOpacity={0.6}
              style={[
                btn,
                { backgroundColor: colors.ctaCream },
              ]}
            >
              <Text style={[btnText, { color: colors.ctaText }]}>Mark as Washed</Text>
            </AuraPressable>
          ) : (
            <>
              <AuraPressable
                onPress={onMarkWorn}
                disabled={actionLoading}
                haptic="light"
                hapticTrigger="press"
                pressedScale={0.98}
                pressedOpacity={0.86}
                disabledOpacity={0.5}
                style={[
                  btn,
                  { backgroundColor: colors.ctaCream },
                ]}
              >
                <Text style={[btnText, { color: colors.ctaText }]}>Mark as Worn</Text>
              </AuraPressable>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <AuraPressable
                  onPress={onSendToLaundry}
                  disabled={actionLoading}
                  haptic="light"
                  hapticTrigger="press"
                  pressedScale={0.98}
                  pressedOpacity={0.86}
                  disabledOpacity={0.6}
                  style={[
                    btn,
                    {
                      borderColor: "rgba(255,255,255,0.22)",
                      borderWidth: 1,
                      backgroundColor: "rgba(255,255,255,0.04)",
                    },
                  ]}
                >
                  <Text style={[btnText, { color: colors.text }]}>Send to Laundry</Text>
                </AuraPressable>
                <AuraPressable
                  onPress={onConfirmWashed}
                  disabled={actionLoading}
                  haptic="selection"
                  hapticTrigger="press"
                  pressedScale={0.98}
                  pressedOpacity={0.86}
                  disabledOpacity={0.6}
                  style={[
                    btn,
                    {
                      borderColor: "rgba(255,255,255,0.16)",
                      borderWidth: 1,
                      backgroundColor: "transparent",
                    },
                  ]}
                >
                  <Text style={[btnText, { color: "rgba(255,255,255,0.88)" }]}>Mark as Washed</Text>
                </AuraPressable>
              </View>
            </>
          )}
        </View>
      ) : null}
    </SafeScreen>
  );
}

const card = {
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: 12,
  backgroundColor: "rgba(255,255,255,0.035)",
} as const;

const btn = {
  flex: 1,
  paddingVertical: 14,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
} as const;

const btnText = {
  fontWeight: "900",
  fontSize: 16,
} as const;

const pill = {
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
} as const;

const pillText = {
  fontWeight: "900",
} as const;

const textInput = {
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
} as const;

function ItemImageModal(props: {
  visible: boolean;
  images: DetailImageAsset[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { visible, images, initialIndex, onClose } = props;
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const windowWidth = Dimensions.get("window").width;

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(initialIndex);
  }, [initialIndex, visible]);

  const imageWidth = Math.max(windowWidth - 32, 1);

  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / imageWidth);
    setActiveIndex(Math.max(0, Math.min(images.length - 1, nextIndex)));
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#111" }}>
        <Text
          style={{
            color: "#fff",
            fontSize: 18,
            fontWeight: "800",
            textAlign: "center",
            paddingTop: insets.top + 16,
          }}
        >
          Photo
        </Text>
        <Pressable
          onPress={onClose}
          style={{
            position: "absolute",
            top: insets.top + 12,
            right: 12,
            zIndex: 10,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 999,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>Close</Text>
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
                  <View
                    style={{
                      width: "100%",
                      minHeight: 360,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#e5d6bf",
                      borderRadius: 20,
                      overflow: "hidden",
                      paddingHorizontal: 24,
                      paddingVertical: 24,
                    }}
                  >
                    <AppImage
                      source={{
                        uri: image.uri,
                      }}
                      style={{ width: "100%", height: 520 }}
                      resizeMode="contain"
                    />
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
                    backgroundColor: index === activeIndex ? "#fff" : "rgba(255,255,255,0.3)",
                  }}
                />
              ))}
              <Text style={{ color: "rgba(255,255,255,0.78)", fontWeight: "700", marginLeft: 8 }}>
                {activeIndex + 1} / {images.length}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function DetailImageCarousel(props: {
  images: DetailImageAsset[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onPressImage: () => void;
  containerAspectRatio: number;
  imageStyle: object;
  imageDecoration: {
    shadowStyle: {
      width: DimensionValue;
      height: DimensionValue;
      bottom: DimensionValue;
      opacity: number;
    };
  };
}) {
  const {
    images,
    activeIndex,
    onIndexChange,
    onPressImage,
    containerAspectRatio,
    imageStyle,
    imageDecoration,
  } = props;
  const layout = useResponsiveLayout();
  const windowWidth = Dimensions.get("window").width;
  const cardWidth = Math.max(windowWidth - layout.horizontalPadding * 2 - 36, 1);
  const cardHeight = Math.min(540, Math.max(300, cardWidth / Math.max(containerAspectRatio, 0.58)));
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
        {images.map((image, index) => {
          const isHeroImage = index === 0;
          return (
          <Pressable
            key={image.uri}
            onPress={onPressImage}
            style={{
              width: cardWidth,
              borderRadius: 18,
              marginRight: index === images.length - 1 ? 0 : cardGap,
            }}
          >
            <View
              style={{
                width: "100%",
                height: cardHeight,
                borderRadius: 18,
                backgroundColor: isHeroImage ? "#e5d6bf" : "rgba(255,255,255,0.04)",
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: isHeroImage ? "rgba(88,66,38,0.08)" : "rgba(255,255,255,0.08)",
                paddingHorizontal: isHeroImage ? 22 : 0,
                paddingVertical: isHeroImage ? 24 : 0,
              }}
            >
              {isHeroImage ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    width: imageDecoration.shadowStyle.width,
                    height: imageDecoration.shadowStyle.height,
                    bottom: imageDecoration.shadowStyle.bottom,
                    borderRadius: 999,
                    backgroundColor: "#6a5131",
                    opacity: imageDecoration.shadowStyle.opacity,
                  }}
                />
              ) : null}
              <AppImage
                source={{
                  uri: image.uri,
                }}
                style={[
                  {
                    width: "100%",
                    height: "100%",
                  },
                  isHeroImage
                    ? imageStyle
                    : null,
                ]}
                resizeMode="contain"
              />
            </View>
          </Pressable>
        );
        })}
      </ScrollView>
      {images.length > 1 ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {images.map((image, index) => (
              <View
                key={`${image.uri}-pagination`}
                style={{
                  width: index === activeIndex ? 18 : 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: index === activeIndex ? "#8bcfff" : "rgba(255,255,255,0.18)",
                }}
              />
            ))}
          </View>
          <Text style={{ color: "#9aa3af", fontSize: 13, fontWeight: "700" }}>
            {activeIndex + 1} / {images.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
