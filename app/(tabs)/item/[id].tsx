import { router, useLocalSearchParams } from "expo-router";
import { deleteDoc, doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../../src/hooks/useAuth";
import { db } from "../../../src/lib/firebase";

type ClothingItem = {
  id: string;
  brand: string;
  name?: string;
  category: string;
  colors?: string[];
  primaryColor?: string;
  status?: "AVAILABLE" | "WORN" | "IN_LAUNDRY";
  wearCountSinceWash?: number;
  photoUrl?: string | null;
  photoUri?: string | null;
  size?: string | null;
  notes?: string | null;
  price?: number | null;
  purchaseDate?: string | null;
};

export default function ItemDetailsScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);

  const [item, setItem] = useState<ClothingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const itemImageUri = item?.photoUrl || item?.photoUri || null;

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
    // We reuse your add screen as an edit screen using query params
    router.push({
      pathname: "/(tabs)/add",
      params: { editId: itemId },
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable onPress={() => router.back()} style={pill}>
            <Text style={pillText}>Back</Text>
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: "900" }}>Item</Text>
          <View style={{ width: 56 }} />
        </View>

        {loading ? (
          <Text>Loading…</Text>
        ) : !item ? (
          <Text>Item not found.</Text>
        ) : (
          <>
            <View style={card}>
              {itemImageUri ? (
                <Image
                  source={{ uri: itemImageUri }}
                  style={{ width: "100%", height: 260, borderRadius: 14 }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ height: 260, borderRadius: 14, backgroundColor: "#f3f3f3", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#777", fontWeight: "800" }}>No photo</Text>
                </View>
              )}

              <View style={{ gap: 6, marginTop: 12 }}>
                <Text style={{ fontSize: 20, fontWeight: "900" }}>
                  {item.name || `${item.primaryColor ?? ""} ${item.category}`}
                </Text>
                <Text style={{ color: "#444", fontWeight: "700" }}>{item.brand}</Text>

                <Text style={{ color: "#666" }}>
                  Category: {item.category}
                </Text>

                {item.colors?.length ? (
                  <Text style={{ color: "#666" }}>
                    Colors: {item.colors.join(" / ")}
                  </Text>
                ) : null}

                {item.status ? <Text style={{ color: "#666" }}>Status: {item.status}</Text> : null}
                {typeof item.wearCountSinceWash === "number" ? (
                  <Text style={{ color: "#666" }}>Wears since wash: {item.wearCountSinceWash}</Text>
                ) : null}

                {item.size ? <Text style={{ color: "#666" }}>Size: {item.size}</Text> : null}
                {typeof item.price === "number" ? <Text style={{ color: "#666" }}>Price: {item.price}</Text> : null}
                {item.purchaseDate ? <Text style={{ color: "#666" }}>Purchase date: {item.purchaseDate}</Text> : null}
                {item.notes ? <Text style={{ color: "#666" }}>Notes: {item.notes}</Text> : null}
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={onEdit} style={[btn, { backgroundColor: "#111" }]}>
                <Text style={[btnText, { color: "#fff" }]}>Edit</Text>
              </Pressable>
              <Pressable onPress={onDelete} style={[btn, { borderColor: "#d11", borderWidth: 1 }]}>
                <Text style={[btnText, { color: "#d11" }]}>Delete</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
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
