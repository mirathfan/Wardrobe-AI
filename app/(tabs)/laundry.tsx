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
import { auth, db } from "../../src/lib/firebase";

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
  const [allItems, setAllItems] = useState<ClothingItem[]>([]);
  const [tab, setTab] = useState<"NEEDS_WASH" | "IN_LAUNDRY" | "CLEAN">(
    "IN_LAUNDRY"
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const itemsRef = collection(db, "users", user.uid, "items");
    const q = query(itemsRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as ClothingItem[];
        setAllItems(all);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, []);

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
      const user = auth.currentUser;
      if (!user) return;

      if (inLaundry.length === 0) {
        Alert.alert("Nothing to wash", "Laundry is empty.");
        return;
      }

      await Promise.all(
        inLaundry.map((it) =>
          updateDoc(doc(db, "users", user.uid, "items", it.id), {
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
      const user = auth.currentUser;
      if (!user) return;

      if (tab !== "NEEDS_WASH") return;

      if (needsWash.length === 0) {
        Alert.alert("All good", "No items currently need washing.");
        return;
      }

      await Promise.all(
        needsWash.map((it) =>
          updateDoc(doc(db, "users", user.uid, "items", it.id), {
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
        <Text style={{ fontSize: 28, fontWeight: "800" }}>Laundry</Text>
        <Text style={{ marginTop: 4, opacity: 0.7 }}>
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
          backgroundColor: "#F2F2F2",
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
                backgroundColor: active ? "#111" : "transparent",
              }}
            >
              <Text style={{ fontWeight: "700", color: active ? "#fff" : "#111" }}>
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
        <Text style={{ fontSize: 18, fontWeight: "800" }}>
          {tab === "NEEDS_WASH"
            ? "Needs Wash"
            : tab === "IN_LAUNDRY"
            ? "In Laundry"
            : "Clean"}
        </Text>
        <Text style={{ opacity: 0.7 }}>{listItems.length} items</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ textAlign: "center", marginTop: 10, opacity: 0.7 }}>
          Loading laundry…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <FlatList
        data={listItems}
        keyExtractor={(item) => item.id}
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
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: "#ECECEC",
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
              <Text style={{ fontSize: 16, fontWeight: "800" }}>
                {item.primaryColor} {item.category}
              </Text>
              <Pill text={item.status === "AVAILABLE" ? "Clean" : item.status === "IN_LAUNDRY" ? "In laundry" : "Worn"} />
            </View>

            <Text style={{ opacity: 0.75, marginBottom: 6 }}>
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
  return (
    <View
      style={{
        flex: 1,
        padding: 12,
        borderRadius: 16,
        backgroundColor: "#111",
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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: disabled ? "#999" : "#111",
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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: "#F2F2F2",
        borderWidth: 1,
        borderColor: "#E6E6E6",
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: "#111", fontWeight: "800" }}>{title}</Text>
    </Pressable>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <View
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "#F2F2F2",
        borderWidth: 1,
        borderColor: "#E6E6E6",
      }}
    >
      <Text style={{ fontWeight: "800", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        padding: 10,
        borderRadius: 14,
        backgroundColor: "#FAFAFA",
        borderWidth: 1,
        borderColor: "#EFEFEF",
      }}
    >
      <Text style={{ opacity: 0.7, fontWeight: "700", fontSize: 12 }}>
        {label}
      </Text>
      <Text style={{ fontWeight: "900", marginTop: 4 }}>{value}</Text>
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
        borderColor: "#ECECEC",
        backgroundColor: "#fff",
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "900" }}>{title}</Text>
      <Text style={{ marginTop: 6, opacity: 0.75 }}>{subtitle}</Text>

      <View style={{ marginTop: 12 }}>
        <PrimaryButton title={action} onPress={onPrimary} />
      </View>
    </View>
  );
}
