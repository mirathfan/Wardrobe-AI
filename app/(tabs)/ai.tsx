import {
    collection,
    doc,
    increment,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { auth, db } from "../src/lib/firebase";

type ClothingStatus = "AVAILABLE" | "WORN" | "IN_LAUNDRY";

type ClothingItem = {
  id: string;
  category: string;
  brand: string;
  primaryColor: string;
  status: ClothingStatus;
  wearCountSinceWash: number;
  createdAt: number;
  lastWornDate?: number | null;
  lastWashedDate?: number | null;
};

function daysAgo(ts?: number | null) {
  if (!ts) return Infinity;
  return Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
}

function fmtShort(ts?: number | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString();
}

export default function AIScreen() {
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const itemsRef = collection(db, "users", user.uid, "items");
    const q = query(itemsRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: ClothingItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setItems(next);
        setLoading(false);
      },
      (err) => {
        console.log(err);
        Alert.alert("Firestore error", err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  async function markWorn(itemId: string) {
    try {
      const user = auth.currentUser;
      if (!user) return;
      await updateDoc(doc(db, "users", user.uid, "items", itemId), {
        status: "WORN",
        wearCountSinceWash: increment(1),
        lastWornDate: Date.now(),
      });
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed");
    }
  }

  async function moveToLaundry(itemId: string) {
    try {
      const user = auth.currentUser;
      if (!user) return;
      await updateDoc(doc(db, "users", user.uid, "items", itemId), {
        status: "IN_LAUNDRY",
      });
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed");
    }
  }

  // “AI” logic (rule-based but feels smart)
  const ai = useMemo(() => {
    const available = items.filter((i) => i.status === "AVAILABLE");

    // Outfit picks: prefer items not worn recently
    const outfitPicks = [...available]
      .sort((a, b) => daysAgo(b.lastWornDate) - daysAgo(a.lastWornDate))
      .slice(0, 5);

    // Rotation: not worn in 7+ days (or never worn)
    const rotate = [...available]
      .filter((i) => daysAgo(i.lastWornDate) >= 7)
      .sort((a, b) => daysAgo(b.lastWornDate) - daysAgo(a.lastWornDate))
      .slice(0, 8);

    // Wash hints: worn 2+ times since wash (and not already in laundry)
    const washHints = items
      .filter((i) => i.status !== "IN_LAUNDRY" && (i.wearCountSinceWash ?? 0) >= 2)
      .sort((a, b) => (b.wearCountSinceWash ?? 0) - (a.wearCountSinceWash ?? 0))
      .slice(0, 8);

    // Color balance hint (simple)
    const colorCounts: Record<string, number> = {};
    available.forEach((i) => {
      const c = (i.primaryColor || "Unknown").toLowerCase();
      colorCounts[c] = (colorCounts[c] || 0) + 1;
    });
    const mostCommon = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0];
    const colorTip = mostCommon
      ? `Your most common clean color is "${mostCommon[0]}". Want variety? Pick a different color today.`
      : "Add more items to get color insights.";

    return { outfitPicks, rotate, washHints, colorTip };
  }, [items]);

  return (
    <View style={{ flex: 1, padding: 16}}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 8 }}>AI</Text>

      {loading ? (
        <Text>Loading…</Text>
      ) : (
        <>
          <View
            style={{
              padding: 12,
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ fontWeight: "700", marginBottom: 6 }}>Quick insight</Text>
            <Text>{ai.colorTip}</Text>
          </View>

          <Section
            title="Outfit picks (clean + least recently worn)"
            data={ai.outfitPicks}
            emptyText="No available items yet."
            onWoreToday={markWorn}
            onToLaundry={moveToLaundry}
          />

          <View style={{ height: 12 }} />

          <Section
            title="Rotate these (not worn in 7+ days)"
            data={ai.rotate}
            emptyText="Nice — you're rotating well."
            onWoreToday={markWorn}
            onToLaundry={moveToLaundry}
          />

          <View style={{ height: 12 }} />

          <Section
            title="Consider washing (worn 2+ times)"
            data={ai.washHints}
            emptyText="No wash suggestions right now."
            onWoreToday={markWorn}
            onToLaundry={moveToLaundry}
          />
        </>
      )}
    </View>
  );
}

function Section({
  title,
  data,
  emptyText,
  onWoreToday,
  onToLaundry,
}: {
  title: string;
  data: ClothingItem[];
  emptyText: string;
  onWoreToday: (id: string) => void;
  onToLaundry: (id: string) => void;
}) {
  return (
    <View>
      <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 8 }}>{title}</Text>

      {data.length === 0 ? (
        <Text style={{ color: "#666" }}>{emptyText}</Text>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.id}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <View
              style={{
                padding: 12,
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 12,
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "600" }}>
                {item.primaryColor} {item.category}
              </Text>
              <Text>Brand: {item.brand}</Text>
              <Text>Status: {item.status}</Text>
              <Text>Wear count since wash: {item.wearCountSinceWash}</Text>
              <Text>Last worn: {fmtShort(item.lastWornDate)}</Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                <PillButton label="Wore today" onPress={() => onWoreToday(item.id)} />
                <PillButton label="To laundry" onPress={() => onToLaundry(item.id)} />
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

function PillButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#111",
      }}
    >
      <Text>{label}</Text>
    </Pressable>
  );
}
