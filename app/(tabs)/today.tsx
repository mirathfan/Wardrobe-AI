// app/(tabs)/today.tsx
import { signInWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { auth, db } from "../../src/lib/firebase";

type ClothingStatus = "AVAILABLE" | "WORN" | "IN_LAUNDRY";

type ClothingItem = {
  id: string;
  brand: string;
  name?: string; // product name (if you stored it)
  category: string;
  colors?: string[];
  primaryColor?: string;
  status: ClothingStatus;
  wearCountSinceWash: number;
  createdAt: number;
  lastWornDate?: number | null;
  lastWashedDate?: number | null;
  photoUri?: string | null;
};

type OutfitDoc = {
  dateKey: string; // YYYY-MM-DD
  itemIds: string[];
  planned: boolean; // true = future plan, false = actually worn/logged
  updatedAt?: any;
  createdAt?: any;
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toDateKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, delta: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtHeaderDate(d: Date) {
  // e.g., Thu, Dec 26
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function TodayScreen() {
  // same test user flow you used elsewhere
  const testEmail = "testuser1@example.com";
  const testPass = "TestPass123!";

  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [outfit, setOutfit] = useState<OutfitDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingMode, setAddingMode] = useState(false);

  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const inFuture = useMemo(() => selectedDate.getTime() > today.getTime(), [selectedDate, today]);

  async function ensureSignedIn() {
    if (auth.currentUser) return auth.currentUser;
    const res = await signInWithEmailAndPassword(auth, testEmail, testPass);
    return res.user;
  }

  useEffect(() => {
    let unsubItems: undefined | (() => void);
    let unsubOutfit: undefined | (() => void);

    (async () => {
      try {
        const user = await ensureSignedIn();

        // 1) listen to wardrobe items
        const itemsRef = collection(db, "users", user.uid, "items");
        const qItems = query(itemsRef, orderBy("createdAt", "desc"));
        unsubItems = onSnapshot(
          qItems,
          (snap) => {
            const next: ClothingItem[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
            setItems(next);
          },
          (err) => {
            console.log(err);
            Alert.alert("Firestore error", err.message);
          }
        );

        // 2) listen to outfit doc for selected date
        const outfitRef = doc(db, "users", user.uid, "outfits", dateKey);
        unsubOutfit = onSnapshot(
          outfitRef,
          (snap) => {
            if (!snap.exists()) {
              setOutfit(null);
            } else {
              setOutfit(snap.data() as OutfitDoc);
            }
            setLoading(false);
          },
          (err) => {
            console.log(err);
            Alert.alert("Firestore error", err.message);
            setLoading(false);
          }
        );
      } catch (e: any) {
        console.log(e);
        Alert.alert("Auth error", e?.message ?? "Auth failed");
        setLoading(false);
      }
    })();

    return () => {
      if (unsubItems) unsubItems();
      if (unsubOutfit) unsubOutfit();
    };
    // IMPORTANT: dateKey changes should re-subscribe for outfit doc
  }, [dateKey]);

  const outfitItemIds = useMemo(() => outfit?.itemIds ?? [], [outfit?.itemIds]);
  const outfitItems = useMemo(() => {
    const map = new Map(items.map((it) => [it.id, it]));
    return outfitItemIds.map((id) => map.get(id)).filter(Boolean) as ClothingItem[];
  }, [items, outfitItemIds]);

  async function ensureOutfitDocExists() {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in");

    const ref = doc(db, "users", user.uid, "outfits", dateKey);

    // create if missing (merge keeps it safe)
    const base: OutfitDoc = {
      dateKey,
      itemIds: outfit?.itemIds ?? [],
      planned: inFuture ? true : false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, base, { merge: true });
  }

  async function toggleItemForDay(itemId: string) {
    try {
      const user = auth.currentUser;
      if (!user) return Alert.alert("Not signed in", "Please sign in first.");

      await ensureOutfitDocExists();

      const ref = doc(db, "users", user.uid, "outfits", dateKey);
      const cur = new Set(outfit?.itemIds ?? []);
      if (cur.has(itemId)) cur.delete(itemId);
      else cur.add(itemId);

      await updateDoc(ref, {
        itemIds: Array.from(cur),
        planned: inFuture ? true : false,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to update outfit");
    }
  }

  async function markAsWornToday() {
    try {
      const user = auth.currentUser;
      if (!user) return Alert.alert("Not signed in", "Please sign in first.");
      if (!isSameDay(selectedDate, today)) {
        return Alert.alert("Not today", "You can only mark as worn on today's date.");
      }
      if ((outfit?.itemIds?.length ?? 0) === 0) {
        return Alert.alert("Empty outfit", "Add items first.");
      }

      const ref = doc(db, "users", user.uid, "outfits", dateKey);
      await setDoc(
        ref,
        {
          dateKey,
          planned: false,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      Alert.alert("Saved ✅", "Logged as worn today.");
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to mark worn");
    }
  }

  // Simple counts like your current UI (optional)
  const wornTodayCount = useMemo(() => (isSameDay(selectedDate, today) && outfitItems.length ? 1 : 0), [
    selectedDate,
    today,
    outfitItems.length,
  ]);

  return (
    <View style={{ flex: 1, padding: 16}}>
      {/* Header with arrows + date */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable onPress={() => setSelectedDate((d) => addDays(d, -1))} style={iconBtn}>
          <Text style={iconText}>‹</Text>
        </Pressable>

        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "800" }}>Today</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", marginTop: 4 }}>{fmtHeaderDate(selectedDate)}</Text>
          <Text style={{ color: "#666", marginTop: 2 }}>
            {inFuture ? "Plan outfit" : isSameDay(selectedDate, today) ? "Outfit for today" : "Outfit history"}
          </Text>
        </View>

        <Pressable onPress={() => setSelectedDate((d) => addDays(d, +1))} style={iconBtn}>
          <Text style={iconText}>›</Text>
        </Pressable>
      </View>

      <View style={{ height: 14 }} />

      {/* Quick summary (you can remove if you want) */}
      <Text style={{ fontSize: 16, fontWeight: "700" }}>Worn today: {wornTodayCount}</Text>

      <View style={{ height: 12 }} />

      {/* Outfit card */}
      <View style={card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "800" }}>
            {outfit ? (outfit.planned ? "Planned outfit" : "Worn outfit") : "No outfit saved"}
          </Text>

          <Pressable onPress={() => setAddingMode((v) => !v)} style={pillBtn}>
            <Text style={pillBtnText}>{addingMode ? "Done" : "Add items"}</Text>
          </Pressable>
        </View>

        <View style={{ height: 10 }} />

        {loading ? (
          <Text>Loading…</Text>
        ) : outfitItems.length === 0 ? (
          <Text style={{ color: "#666" }}>
            {inFuture
              ? "No planned items yet. Tap “Add items” and pick what you want to wear."
              : "Nothing logged for this date. Tap “Add items” to save what you wore (or planned)."}
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {outfitItems.map((it) => (
              <View key={it.id} style={miniCard}>
                <Text style={{ fontSize: 15, fontWeight: "800" }}>
                  {(it.primaryColor ?? it.colors?.[0] ?? "").toString()} {it.category}
                </Text>
                <Text style={{ color: "#111" }}>Brand: {it.brand}</Text>
                {it.name ? <Text style={{ color: "#111" }}>Name: {it.name}</Text> : null}
                {it.colors?.length ? <Text style={{ color: "#666" }}>Colors: {it.colors.join(" / ")}</Text> : null}
              </View>
            ))}
          </View>
        )}

        {isSameDay(selectedDate, today) && outfitItems.length > 0 && (
          <>
            <View style={{ height: 12 }} />
            <Pressable onPress={markAsWornToday} style={primaryBtn}>
              <Text style={primaryBtnText}>Mark as worn today</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Add items panel */}
      {addingMode && (
        <>
          <View style={{ height: 14 }} />
          <Text style={{ fontSize: 16, fontWeight: "800", marginBottom: 10 }}>Pick from wardrobe</Text>

          <FlatList
            data={items}
            keyExtractor={(x) => x.id}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => {
              const selected = outfitItemIds.includes(item.id);
              return (
                <Pressable
                  onPress={() => toggleItemForDay(item.id)}
                  style={[
                    card,
                    {
                      borderColor: selected ? "#111" : "#ddd",
                      backgroundColor: selected ? "#111" : "#fff",
                    },
                  ]}
                >
                  <Text style={{ fontSize: 16, fontWeight: "800", color: selected ? "#fff" : "#111" }}>
                    {(item.primaryColor ?? item.colors?.[0] ?? "").toString()} {item.category}
                  </Text>
                  <Text style={{ color: selected ? "#fff" : "#111" }}>
                    {item.brand}
                    {item.name ? ` • ${item.name}` : ""}
                  </Text>
                  <Text style={{ color: selected ? "#ddd" : "#666", marginTop: 6 }}>
                    {selected ? "Added to this date ✓" : "Tap to add"}
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text>No wardrobe items found.</Text>}
          />
        </>
      )}

      <View style={{ height: 24 }} />
    </View>
  );
}

const card = {
  padding: 12,
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 14,
  backgroundColor: "#fff",
} as const;

const miniCard = {
  padding: 10,
  borderWidth: 1,
  borderColor: "#eee",
  borderRadius: 12,
  backgroundColor: "#fafafa",
} as const;

const iconBtn = {
  width: 44,
  height: 44,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "#ddd",
  alignItems: "center",
  justifyContent: "center",
} as const;

const iconText = {
  fontSize: 26,
  fontWeight: "900",
} as const;

const pillBtn = {
  paddingVertical: 8,
  paddingHorizontal: 14,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "#111",
} as const;

const pillBtnText = {
  fontWeight: "900",
} as const;

const primaryBtn = {
  paddingVertical: 12,
  borderRadius: 14,
  backgroundColor: "#111",
  alignItems: "center",
} as const;

const primaryBtnText = {
  color: "#fff",
  fontWeight: "900",
  fontSize: 15,
} as const;
