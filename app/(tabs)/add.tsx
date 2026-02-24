import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { auth, db } from "../../src/lib/firebase";

const QUICK_CATEGORIES = [
  "tshirt",
  "shirt",
  "jeans",
  "shoes",
  "hoodie",
  "jacket",
  "accessories",
];

const DEFAULT_COLORS = [
  "Black",
  "White",
  "Blue",
  "Grey",
  "Brown",
  "Green",
  "Red",
  "Gold",
  "Beige",
  "Cream",
  "Silver",
];

function norm(s: string) {
  return (s || "").trim();
}
function normColor(s: string) {
  const t = norm(s);
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function isQuickCategory(cat: string) {
  return QUICK_CATEGORIES.includes((cat || "").trim().toLowerCase());
}

export default function AddItemScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const editItemId = useMemo(
    () => (Array.isArray(editId) ? editId[0] : editId),
    [editId]
  );
  const isEdit = !!editItemId;

  // test user auth
  const testEmail = "testuser1@example.com";
  const testPass = "TestPass123!";

  const [loading, setLoading] = useState(false);

  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");

  // category: quick pick + custom via + chip
  const [category, setCategory] = useState("tshirt");
  const [customCategory, setCustomCategory] = useState("");
  const [addingCustomCategory, setAddingCustomCategory] = useState(false);

  // colors: multi-select + custom via + chip
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [customColor, setCustomColor] = useState("");
  const [addingCustomColor, setAddingCustomColor] = useState(false);

  // extra fields
  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");

  // local photo only (no Firebase Storage)
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  async function ensureSignedIn() {
    if (auth.currentUser) return auth.currentUser;
    const res = await signInWithEmailAndPassword(auth, testEmail, testPass);
    return res.user;
  }

  // ✅ sign in on mount
  useEffect(() => {
    ensureSignedIn().catch((e) =>
      Alert.alert("Auth error", e?.message ?? "Auth failed")
    );
  }, []);

  // ✅ if edit mode, load item once
  useEffect(() => {
    (async () => {
      try {
        if (!isEdit) return;

        setLoading(true);
        const user = await ensureSignedIn();
        if (!user) return;

        const ref = doc(db, "users", user.uid, "items", String(editItemId));
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          Alert.alert("Not found", "This item no longer exists.");
          router.back();
          return;
        }

        const data = snap.data() as any;

        setBrand(data.brand ?? "");
        setName(data.name ?? "");

        const loadedCategory = (data.category ?? "tshirt").toString().toLowerCase();
        if (isQuickCategory(loadedCategory)) {
          setCategory(loadedCategory);
          setCustomCategory("");
        } else {
          // keep quick selection but store actual category in customCategory (no input shown unless user taps +)
          setCategory("tshirt");
          setCustomCategory(loadedCategory);
        }
        setAddingCustomCategory(false);

        const loadedColors: string[] =
          Array.isArray(data.colors) && data.colors.length
            ? data.colors.map(normColor).filter(Boolean)
            : data.primaryColor
            ? [normColor(data.primaryColor)]
            : [];

        setSelectedColors(loadedColors);
        setCustomColor("");
        setAddingCustomColor(false);

        setSize(data.size ?? "");
        setNotes(data.notes ?? "");
        setPrice(data.price != null ? String(data.price) : "");
        setPurchaseDate(data.purchaseDate ?? "");
        setPhotoUri(data.photoUri ?? null);
      } catch (e: any) {
        console.log(e);
        Alert.alert("Error", e?.message ?? "Failed to load item");
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, editItemId]);

  const categoryFinal = useMemo(() => {
    // if user has a stored custom category, use it; else use selected quick
    const c = norm(customCategory) || norm(category);
    return c.toLowerCase();
  }, [category, customCategory]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_COLORS.map(normColor));
    selectedColors.forEach((c) => set.add(normColor(c)));
    return Array.from(set);
  }, [selectedColors]);

  function toggleColor(c: string) {
    const color = normColor(c);
    if (!color) return;
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((x) => x !== color) : [...prev, color]
    );
  }

  function addCustomColorNow() {
    const c = normColor(customColor);
    if (!c) return;
    setSelectedColors((prev) => (prev.includes(c) ? prev : [...prev, c]));
    setCustomColor("");
    setAddingCustomColor(false);
  }

  function addCustomCategoryNow() {
    const c = norm(customCategory);
    if (!c) return;
    // store as customCategory (so it stays custom), and also set quick category for UI baseline
    setCustomCategory(c.toLowerCase());
    setAddingCustomCategory(false);
  }

  async function pickPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Allow photo access to pick an item photo."
        );
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (res.canceled) return;
      setPhotoUri(res.assets[0].uri);
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to pick image");
    }
  }

  function parsePriceToNumber(s: string) {
    const t = norm(s);
    if (!t) return null;
    const cleaned = t.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  function parsePurchaseDate(s: string) {
    // basic validation for YYYY-MM-DD
    const t = norm(s);
    if (!t) return null;
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(t);
    if (!ok) return "INVALID";
    return t;
  }

  async function saveItem() {
    const b = norm(brand);
    const n = norm(name);

    if (!b) return Alert.alert("Missing brand", "Enter a brand (e.g., Nike).");
    if (!n)
      return Alert.alert(
        "Missing product name",
        "Enter a name (e.g., Air Jordan 2)."
      );
    if (!categoryFinal)
      return Alert.alert(
        "Missing category",
        "Pick a category or add a custom one."
      );
    if (selectedColors.length === 0)
      return Alert.alert("Missing colors", "Select at least 1 color.");

    const user = auth.currentUser;
    if (!user) return Alert.alert("Not signed in", "Please sign in first.");

    const priceNum = parsePriceToNumber(price);
    const date = parsePurchaseDate(purchaseDate);
    if (date === "INVALID") {
      return Alert.alert(
        "Bad date format",
        "Use YYYY-MM-DD (example: 2025-12-26) or leave it empty."
      );
    }

    const payload = {
      brand: b,
      name: n,
      category: categoryFinal,
      colors: selectedColors.map(normColor).filter(Boolean),
      primaryColor: normColor(selectedColors[0] ?? ""),
      size: norm(size) || null,
      notes: norm(notes) || null,
      price: priceNum,
      purchaseDate: date,
      photoUri: photoUri,
      updatedAt: Date.now(),
    };

    try {
      setLoading(true);

      if (isEdit) {
        await updateDoc(
          doc(db, "users", user.uid, "items", String(editItemId)),
          payload
        );
        Alert.alert("Saved ✅", "Item updated.");
        router.back();
        return;
      }

      await addDoc(collection(db, "users", user.uid, "items"), {
        ...payload,
        status: "AVAILABLE",
        wearCountSinceWash: 0,
        createdAt: Date.now(),
        lastWornDate: null,
        lastWashedDate: Date.now(),
      });

      Alert.alert("Added ✅", "Item added to wardrobe.");

      // reset only in add mode
      setBrand("");
      setName("");

      setCategory("tshirt");
      setCustomCategory("");
      setAddingCustomCategory(false);

      setSelectedColors([]);
      setCustomColor("");
      setAddingCustomColor(false);

      setSize("");
      setNotes("");
      setPrice("");
      setPurchaseDate("");
      setPhotoUri(null);
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? (isEdit ? "Failed to update item" : "Failed to add item"));
    } finally {
      setLoading(false);
    }
  }

  const canAddCustomColor = customColor.trim().length > 0;
  const canAddCustomCategory = customCategory.trim().length > 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={() => router.back()} style={btnSecondary}>
          <Text style={btnSecondaryText}>Back</Text>
        </Pressable>

        <Text style={{ fontSize: 22, fontWeight: "800" }}>
          {isEdit ? "Edit Item" : "Add Item"}
        </Text>

        <View style={{ width: 60 }} />
      </View>

      {loading ? <Text>Loading…</Text> : null}

      {/* Photo */}
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Photo</Text>

        {photoUri ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image
              source={{ uri: photoUri }}
              style={{
                width: 88,
                height: 88,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#ddd",
              }}
            />
            <View style={{ gap: 8 }}>
              <Pressable onPress={pickPhoto} style={btnSecondary}>
                <Text style={btnSecondaryText}>Change photo</Text>
              </Pressable>
              <Pressable onPress={() => setPhotoUri(null)} style={btnSecondary}>
                <Text style={btnSecondaryText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={pickPhoto} style={btnSecondary}>
            <Text style={btnSecondaryText}>Pick from gallery</Text>
          </Pressable>
        )}
      </View>

      {/* Brand */}
      <Field label="Brand">
        <TextInput
          value={brand}
          onChangeText={setBrand}
          placeholder="e.g., Nike"
          style={input}
        />
      </Field>

      {/* Product name */}
      <Field label="Product name">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g., Air Jordan 2"
          style={input}
        />
      </Field>

      {/* Category */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Category</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {QUICK_CATEGORIES.map((cat) => (
            <Pill
              key={cat}
              label={cat}
              active={customCategory.trim().length === 0 && category === cat}
              onPress={() => {
                setCategory(cat);
                setCustomCategory(""); // clear custom when picking quick
                setAddingCustomCategory(false);
              }}
            />
          ))}

          {/* + chip / input */}
          {addingCustomCategory ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput
                value={customCategory}
                onChangeText={setCustomCategory}
                placeholder="Type category"
                style={[input, { paddingVertical: 8, width: 160 }]}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (!canAddCustomCategory) return;
                  addCustomCategoryNow();
                }}
              />

              <Pressable
                onPress={addCustomCategoryNow}
                disabled={!canAddCustomCategory}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: canAddCustomCategory ? "#111" : "#ddd",
                  backgroundColor: canAddCustomCategory ? "#111" : "transparent",
                  opacity: canAddCustomCategory ? 1 : 0.5,
                }}
              >
                <Text
                  style={{
                    color: canAddCustomCategory ? "#fff" : "#111",
                    fontWeight: "800",
                  }}
                >
                  Add
                </Text>
              </Pressable>

              <Pill
                label="Cancel"
                active={false}
                onPress={() => {
                  setCustomCategory("");
                  setAddingCustomCategory(false);
                }}
              />
            </View>
          ) : (
            <Pill label="+" active={false} onPress={() => setAddingCustomCategory(true)} />
          )}
        </View>

        {(customCategory.trim().length > 0 && !addingCustomCategory) ? (
          <Text style={{ color: "#666" }}>Using custom category: {categoryFinal}</Text>
        ) : null}
      </View>

      {/* Colors */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Colors</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {colorOptions.map((c) => (
            <Pill
              key={c}
              label={c}
              active={selectedColors.includes(c)}
              onPress={() => toggleColor(c)}
            />
          ))}

          {/* + chip / input */}
          {addingCustomColor ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput
                value={customColor}
                onChangeText={setCustomColor}
                placeholder="Type color"
                style={[input, { paddingVertical: 8, width: 160 }]}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (!canAddCustomColor) return;
                  addCustomColorNow();
                }}
              />

              <Pressable
                onPress={addCustomColorNow}
                disabled={!canAddCustomColor}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: canAddCustomColor ? "#111" : "#ddd",
                  backgroundColor: canAddCustomColor ? "#111" : "transparent",
                  opacity: canAddCustomColor ? 1 : 0.5,
                }}
              >
                <Text
                  style={{
                    color: canAddCustomColor ? "#fff" : "#111",
                    fontWeight: "800",
                  }}
                >
                  Add
                </Text>
              </Pressable>

              <Pill
                label="Cancel"
                active={false}
                onPress={() => {
                  setCustomColor("");
                  setAddingCustomColor(false);
                }}
              />
            </View>
          ) : (
            <Pill label="+" active={false} onPress={() => setAddingCustomColor(true)} />
          )}
        </View>

        {selectedColors.length > 0 ? (
          <Text style={{ color: "#666" }}>
            Selected: {selectedColors.join(" / ")}
          </Text>
        ) : null}
      </View>

      {/* Extra fields */}
      <Field label="Size">
        <TextInput
          value={size}
          onChangeText={setSize}
          placeholder="e.g., US 10 / M / 32"
          style={input}
        />
      </Field>

      <Field label="Price">
        <TextInput
          value={price}
          onChangeText={setPrice}
          placeholder="e.g., 220"
          keyboardType="numeric"
          style={input}
        />
      </Field>

      <Field label="Purchase date">
        <TextInput
          value={purchaseDate}
          onChangeText={setPurchaseDate}
          placeholder="YYYY-MM-DD"
          style={input}
        />
      </Field>

      <Field label="Notes">
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g., Limited edition, gift from friend..."
          style={[input, { height: 90, textAlignVertical: "top" }]}
          multiline
        />
      </Field>

      {/* Save */}
      <Pressable onPress={saveItem} style={[btnPrimary, loading ? { opacity: 0.6 } : null]} disabled={loading}>
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>
          {isEdit ? "Save Changes" : "Add to Wardrobe"}
        </Text>
      </Pressable>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: "700" }}>{label}</Text>
      {children}
    </View>
  );
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? "#111" : "#ddd",
        backgroundColor: active ? "#111" : "transparent",
      }}
    >
      <Text style={{ color: active ? "#fff" : "#111", fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

const input = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
} as const;

const btnPrimary = {
  marginTop: 6,
  paddingVertical: 14,
  borderRadius: 14,
  backgroundColor: "#111",
  alignItems: "center",
} as const;

const btnSecondary = {
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#ddd",
  alignItems: "center",
} as const;

const btnSecondaryText = {
  fontWeight: "800",
  color: "#111",
} as const;
