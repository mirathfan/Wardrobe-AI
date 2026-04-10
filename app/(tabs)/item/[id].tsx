import { router, useLocalSearchParams } from "expo-router";
import { deleteDoc, deleteField, doc, onSnapshot, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SafeScreen } from "../../../src/components/SafeScreen";
import { ALLOWED_COLORS } from "../../../src/shared/wardrobeTaxonomy";
import { useAuth } from "../../../src/hooks/useAuth";
import { useAppTheme } from "../../../src/hooks/useAppTheme";
import { useResponsiveLayout } from "../../../src/hooks/useResponsiveLayout";
import { db } from "../../../src/lib/firebase";
import { getItemImageUrl } from "../../../src/lib/itemImage";
import {
  getIngestionStatus,
  markWashed as markWashedItem,
  safeMarkWorn,
  sendToLaundry,
} from "../../../src/lib/items";
import { ClothingItem } from "../../../src/types/ClothingItem";

type ItemDetails = ClothingItem & {
  id: string;
};

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

function ingestionStatusLabel(item: ItemDetails) {
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
    tone === "success" ? colors.accent : tone === "danger" ? "#ff6b6b" : colors.text;
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);

  const [item, setItem] = useState<ItemDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [colorSaving, setColorSaving] = useState(false);
  const [colorSavedAt, setColorSavedAt] = useState<number | null>(null);
  const [detailImageOpen, setDetailImageOpen] = useState(false);
  const [patternDraft, setPatternDraft] = useState("");
  const [materialDraft, setMaterialDraft] = useState("");
  const [footerHeight, setFooterHeight] = useState(0);
  const itemImageUri = getItemImageUrl(item, { variant: "hero" });
  const footerOffset = layout.composerOffset;
  const quickFacts = item
    ? [
        { label: "Category", value: formatValue(item.category) },
        { label: "Sub-category", value: formatValue(item.subCategory) },
        { label: "Size", value: formatValue(item.size) },
        {
          label: "Status",
          value: formatValue(item.status || "available"),
          tone: item.status === "IN_LAUNDRY" ? ("danger" as const) : ("default" as const),
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
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to mark item as worn");
    } finally {
      setActionLoading(false);
    }
  }

  async function onSendToLaundry() {
    if (!uid || !itemId) return router.replace("/(auth)/login");

    try {
      setActionLoading(true);
      await sendToLaundry(uid, itemId);
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to send item to laundry");
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
          } catch (e: any) {
            console.log(e);
            Alert.alert("Error", e?.message ?? "Failed to mark item as washed");
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
              router.back();
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
        uri={itemImageUri}
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
            onPress={() => router.back()}
            style={[pill, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={pillText}>Back</Text>
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
              {itemImageUri ? (
                <Pressable
                  onPress={() => setDetailImageOpen(true)}
                  style={{ width: "100%", height: 216, borderRadius: 18 }}
                >
                  <View
                    style={{
                      width: "100%",
                      height: 216,
                      borderRadius: 18,
                      backgroundColor: "rgba(255,255,255,0.04)",
                      overflow: "hidden",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 18,
                    }}
                  >
                    <Image
                      source={{ uri: itemImageUri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="contain"
                    />
                  </View>
                </Pressable>
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
                <Text style={{ color: "#d11", fontWeight: "700", marginTop: 12 }}>
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
                  <Text style={{ color: "#7a5a18", fontWeight: "700", lineHeight: 20 }}>
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
                    <Pressable
                      onPress={() => {
                        setPatternDraft("");
                        void saveField("pattern", null);
                      }}
                      style={pill}
                    >
                      <Text style={pillText}>Auto (AI)</Text>
                    </Pressable>
                    <TextInput
                      value={patternDraft}
                      onChangeText={setPatternDraft}
                      onEndEditing={() => void saveField("pattern", patternDraft.trim() || null)}
                      placeholder={item.pattern || "Auto (AI)"}
                      style={[textInput, { flex: 1 }]}
                    />
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: "800" }}>Material</Text>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Pressable
                      onPress={() => {
                        setMaterialDraft("");
                        void saveField("material", null);
                      }}
                      style={pill}
                    >
                      <Text style={pillText}>Auto (AI)</Text>
                    </Pressable>
                    <TextInput
                      value={materialDraft}
                      onChangeText={setMaterialDraft}
                      onEndEditing={() => void saveField("material", materialDraft.trim() || null)}
                      placeholder={item.material || "Auto (AI)"}
                      style={[textInput, { flex: 1 }]}
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
                      <Pressable
                        onPress={onResetToAI}
                        disabled={colorSaving}
                        style={{
                          alignSelf: "flex-start",
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.18)",
                          backgroundColor: "rgba(255,255,255,0.03)",
                          opacity: colorSaving ? 0.65 : 1,
                        }}
                      >
                        <Text style={{ color: colors.text, fontWeight: "700" }}>Reset to AI</Text>
                      </Pressable>
                    ) : null}
                    {colorSavedAt ? (
                      <Text style={{ color: "#0a7", fontSize: 12, fontWeight: "700" }}>Saved</Text>
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
          {item.status === "IN_LAUNDRY" ? (
            <Pressable
              onPress={onConfirmWashed}
              disabled={actionLoading}
              style={[
                btn,
                { backgroundColor: "#fff" },
                actionLoading ? { opacity: 0.6 } : null,
              ]}
            >
              <Text style={[btnText, { color: "#111" }]}>Mark as Washed</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={onMarkWorn}
                disabled={actionLoading}
                style={[
                  btn,
                  { backgroundColor: "#fff" },
                  actionLoading ? { opacity: 0.5 } : null,
                ]}
              >
                <Text style={[btnText, { color: "#111" }]}>Mark as Worn</Text>
              </Pressable>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={onSendToLaundry}
                  disabled={actionLoading}
                  style={[
                    btn,
                    {
                      borderColor: "rgba(255,255,255,0.22)",
                      borderWidth: 1,
                      backgroundColor: "rgba(255,255,255,0.04)",
                    },
                    actionLoading ? { opacity: 0.6 } : null,
                  ]}
                >
                  <Text style={[btnText, { color: "#fff" }]}>Send to Laundry</Text>
                </Pressable>
                <Pressable
                  onPress={onConfirmWashed}
                  disabled={actionLoading}
                  style={[
                    btn,
                    {
                      borderColor: "rgba(255,255,255,0.16)",
                      borderWidth: 1,
                      backgroundColor: "transparent",
                    },
                    actionLoading ? { opacity: 0.6 } : null,
                  ]}
                >
                  <Text style={[btnText, { color: "rgba(255,255,255,0.88)" }]}>Mark as Washed</Text>
                </Pressable>
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
  borderColor: "#eee",
  borderRadius: 16,
  padding: 12,
  backgroundColor: "#fff",
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
  borderColor: "#ddd",
} as const;

const pillText = {
  fontWeight: "900",
} as const;

const textInput = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
} as const;

function ItemImageModal(props: {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}) {
  const { visible, uri, onClose } = props;
  const insets = useSafeAreaInsets();

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
          {uri ? (
            <View
              style={{
                width: "100%",
                minHeight: 360,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#fff",
                borderRadius: 20,
                overflow: "hidden",
              }}
            >
              <Image source={{ uri }} style={{ width: "100%", height: 520 }} resizeMode="contain" />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
