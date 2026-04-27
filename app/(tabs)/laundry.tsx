import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { db } from "@/src/lib/firebase";
import { isVisibleWardrobeItem } from "@/src/lib/items";

type Status = "AVAILABLE" | "WORN" | "IN_LAUNDRY";

type ClothingItem = {
  id: string;
  category: string;
  brand: string;
  primaryColor: string;
  status: Status;
  wearCountSinceWash: number;
  createdAt: number;
  lastWashedDate?: number;
};

const TABS: { key: "NEEDS_WASH" | "IN_LAUNDRY" | "CLEAN"; label: string }[] = [
  { key: "NEEDS_WASH", label: "Needs wash" },
  { key: "IN_LAUNDRY", label: "In laundry" },
  { key: "CLEAN", label: "Clean" },
];

export default function LaundryScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const uid = user?.uid ?? null;
  const floatingTabSpace = layout.bottomDockPadding;
  const [allItems, setAllItems] = useState<ClothingItem[]>([]);
  const [tab, setTab] = useState<"NEEDS_WASH" | "IN_LAUNDRY" | "CLEAN">(
    "IN_LAUNDRY"
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      router.replace("/(auth)/login");
      return;
    }

    const itemsRef = collection(db, "users", uid, "items");
    const q = query(itemsRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })).filter((item) => isVisibleWardrobeItem(item)) as ClothingItem[];
        setAllItems(all);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [uid]);

  // Simple “needs wash” logic: worn items OR wearCountSinceWash >= 3
  // (tweak threshold later)
  const needsWash = useMemo(
    () =>
      allItems.filter(
        (x) => x.status === "WORN" || (x.wearCountSinceWash ?? 0) >= 3
      ),
    [allItems]
  );

  const inLaundry = useMemo(
    () => allItems.filter((x) => x.status === "IN_LAUNDRY"),
    [allItems]
  );

  const clean = useMemo(
    () => allItems.filter((x) => x.status === "AVAILABLE"),
    [allItems]
  );

  const listItems = useMemo(() => {
    if (tab === "NEEDS_WASH") return needsWash;
    if (tab === "IN_LAUNDRY") return inLaundry;
    return clean;
  }, [tab, needsWash, inLaundry, clean]);

  const counts = useMemo(
    () => ({
      needsWash: needsWash.length,
      inLaundry: inLaundry.length,
      clean: clean.length,
    }),
    [needsWash.length, inLaundry.length, clean.length]
  );

  async function markAllWashed() {
    try {
      if (!uid) return router.replace("/(auth)/login");

      if (inLaundry.length === 0) {
        Alert.alert("Nothing to wash", "Laundry is empty.");
        return;
      }

      await Promise.all(
        inLaundry.map((it) =>
          updateDoc(doc(db, "users", uid, "items", it.id), {
            status: "AVAILABLE",
            wearCountSinceWash: 0,
            lastWashedDate: Date.now(),
          })
        )
      );

      Alert.alert("Done", "Marked all laundry items as washed.");
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to mark items as washed");
    }
  }

  async function moveTabItemsToLaundry() {
    // Optional: when on Needs wash tab, quickly move them to IN_LAUNDRY
    try {
      if (!uid) return router.replace("/(auth)/login");

      if (tab !== "NEEDS_WASH") return;

      if (needsWash.length === 0) {
        Alert.alert("All good", "No items currently need washing.");
        return;
      }

      await Promise.all(
        needsWash.map((it) =>
          updateDoc(doc(db, "users", uid, "items", it.id), {
            status: "IN_LAUNDRY",
          })
        )
      );

      Alert.alert("Added", "Moved items to In Laundry.");
      setTab("IN_LAUNDRY");
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to move items");
    }
  }

  const Header = (
    <View style={{ paddingBottom: 12 }}>
      {/* Title */}
      <View style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.5 }}>Laundry</Text>
        <Text style={{ marginTop: 4, opacity: 0.65, lineHeight: 22, color: colors.textSecondary }}>
          Track what needs washing, what’s in progress, and what’s clean.
        </Text>
      </View>

      {/* Summary cards */}
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
        <SummaryCard title="Needs wash" value={counts.needsWash} subtitle="items" />
        <SummaryCard title="In laundry" value={counts.inLaundry} subtitle="items" />
        <SummaryCard title="Clean" value={counts.clean} subtitle="items" />
      </View>

      {/* Quick actions */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <PrimaryButton
          title="Mark all washed"
          onPress={markAllWashed}
          disabled={inLaundry.length === 0}
        />
        <GhostButton
          title={tab === "NEEDS_WASH" ? "Move to laundry" : "Move to laundry"}
          onPress={moveTabItemsToLaundry}
          disabled={tab !== "NEEDS_WASH" || needsWash.length === 0}
        />
      </View>

      {/* Tabs */}
      <View
        style={{
          flexDirection: "row",
          padding: 4,
          borderRadius: 14,
          backgroundColor: colors.muted,
          gap: 6,
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: "center",
                backgroundColor: active ? colors.accent : "transparent",
              }}
            >
              <Text style={{ fontWeight: "700", color: active ? "#fff" : colors.text }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Section header */}
      <View
        style={{
          marginTop: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>
          {tab === "NEEDS_WASH"
            ? "Needs Wash"
            : tab === "IN_LAUNDRY"
            ? "In Laundry"
            : "Clean"}
        </Text>
        <Text style={{ opacity: 0.7, color: colors.textSecondary }}>{listItems.length} items</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          paddingHorizontal: layout.horizontalPadding,
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator />
        <Text style={{ textAlign: "center", marginTop: 10, opacity: 0.7 }}>
          Loading laundry…
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: layout.horizontalPadding,
        paddingTop: layout.topContentInset,
        backgroundColor: colors.background,
      }}
    >
      <FlatList
        data={listItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: floatingTabSpace }}
        ListHeaderComponent={Header}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <EmptyState
            tab={tab}
            onPrimary={() => {
              if (tab === "IN_LAUNDRY") markAllWashed();
              else if (tab === "NEEDS_WASH") moveTabItemsToLaundry();
              else setTab("NEEDS_WASH");
            }}
          />
        }
        renderItem={({ item }) => (
          <View
            style={{
              padding: 14,
              borderRadius: 16,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>
                {item.primaryColor} {item.category}
              </Text>
              <Pill text={item.status === "AVAILABLE" ? "Clean" : item.status === "IN_LAUNDRY" ? "In laundry" : "Worn"} />
            </View>

            <Text style={{ opacity: 0.75, marginBottom: 6, color: colors.textSecondary }}>
              Brand: {item.brand || "—"}
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <MiniStat label="Wear count" value={String(item.wearCountSinceWash ?? 0)} />
              <MiniStat
                label="Last washed"
                value={item.lastWashedDate ? new Date(item.lastWashedDate).toLocaleDateString() : "—"}
              />
            </View>
          </View>
        )}
      />
    </View>
  );
}

/* ---------- small UI components ---------- */

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: number;
  subtitle: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flex: 1,
        padding: 12,
        borderRadius: 16,
        backgroundColor: colors.accent,
      }}
    >
      <Text style={{ color: "#fff", opacity: 0.8, fontWeight: "700" }}>
        {title}
      </Text>
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 6 }}>
        {value}
      </Text>
      <Text style={{ color: "#fff", opacity: 0.7, marginTop: 2 }}>
        {subtitle}
      </Text>
    </View>
  );
}

function PrimaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: disabled ? colors.textSecondary : colors.accent,
        alignItems: "center",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "800" }}>{title}</Text>
    </Pressable>
  );
}

function GhostButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: colors.muted,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: "800" }}>{title}</Text>
    </Pressable>
  );
}

function Pill({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: colors.muted,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontWeight: "800", fontSize: 12, color: colors.text }}>{text}</Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flex: 1,
        padding: 10,
        borderRadius: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ opacity: 0.7, fontWeight: "700", fontSize: 12, color: colors.textSecondary }}>
        {label}
      </Text>
      <Text style={{ fontWeight: "900", marginTop: 4, color: colors.text }}>{value}</Text>
    </View>
  );
}

function EmptyState({
  tab,
  onPrimary,
}: {
  tab: "NEEDS_WASH" | "IN_LAUNDRY" | "CLEAN";
  onPrimary: () => void;
}) {
  const { colors } = useAppTheme();
  const title =
    tab === "IN_LAUNDRY"
      ? "No items in laundry"
      : tab === "NEEDS_WASH"
      ? "Nothing needs washing"
      : "No clean items here";

  const subtitle =
    tab === "IN_LAUNDRY"
      ? "When you move items to laundry, they’ll show up here."
      : tab === "NEEDS_WASH"
      ? "Wear more items or adjust your wash threshold."
      : "Once washed, items appear as clean.";

  const action =
    tab === "IN_LAUNDRY"
      ? "Refresh"
      : tab === "NEEDS_WASH"
      ? "Move to laundry"
      : "Go to Needs wash";

  return (
    <View
      style={{
        marginTop: 14,
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "900", color: colors.text }}>{title}</Text>
      <Text style={{ marginTop: 6, opacity: 0.75, color: colors.textSecondary }}>{subtitle}</Text>

      <View style={{ marginTop: 12 }}>
        <PrimaryButton title={action} onPress={onPrimary} />
      </View>
    </View>
  );
}
