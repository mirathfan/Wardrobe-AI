import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { collection, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
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

import { useAuth } from "../../src/hooks/useAuth";
import { db } from "../../src/lib/firebase";
import { normalizeCategoryForStorage } from "../../src/lib/items";
import {
  Category,
  SUB_CATEGORIES,
  isValidCategorySubCategory,
  wearSlot,
} from "../../src/shared/wardrobeTaxonomy";
import { uploadItemPhoto } from "../../src/lib/uploadImage";

const CATEGORIES: Category[] = Object.values(Category);

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

export default function AddItemScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const editItemId = useMemo(
    () => (Array.isArray(editId) ? editId[0] : editId),
    [editId]
  );
  const isEdit = !!editItemId;

  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>(Category.TOP);
  const [subCategory, setSubCategory] = useState("");

  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [customColor, setCustomColor] = useState("");
  const [addingCustomColor, setAddingCustomColor] = useState(false);

  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [pendingPhotoWidth, setPendingPhotoWidth] = useState<number | null>(null);

  const previewPhotoUri = pendingPhotoUri ?? photoUrl ?? photoUri ?? null;

  useEffect(() => {
    (async () => {
      try {
        if (!isEdit) return;
        if (!uid) {
          router.replace("/(auth)/login");
          return;
        }

        setLoading(true);
        const ref = doc(db, "users", uid, "items", String(editItemId));
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          Alert.alert("Not found", "This item no longer exists.");
          router.back();
          return;
        }

        const data = snap.data() as any;

        setBrand(data.brand ?? "");
        setName(data.name ?? "");
        const loadedCategory = normalizeCategoryForStorage(data.category);
        setCategory(loadedCategory);
        setSubCategory(
          isValidCategorySubCategory(loadedCategory, data.subCategory)
            ? data.subCategory
            : ""
        );

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

        setPhotoUrl(data.photoUrl ?? null);
        setPhotoUri(data.photoUri ?? null);
        setPendingPhotoUri(null);
        setPendingPhotoWidth(null);
      } catch (e: any) {
        console.log(e);
        Alert.alert("Error", e?.message ?? "Failed to load item");
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, editItemId, uid]);

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

  async function pickPhoto(source: "library" | "camera") {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          source === "camera"
            ? "Allow camera access to capture an item photo."
            : "Allow photo access to pick an item photo."
        );
        return;
      }

      const res =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 1,
              allowsEditing: true,
              aspect: [1, 1],
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 1,
              allowsEditing: true,
              aspect: [1, 1],
            });

      if (res.canceled || !res.assets[0]) return;

      const asset = res.assets[0];
      setPendingPhotoUri(asset.uri);
      setPendingPhotoWidth(asset.width ?? null);
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to pick image");
    }
  }

  async function resolvePhotoFields(currentUid: string, itemId: string) {
    if (pendingPhotoUri) {
      setUploadingPhoto(true);
      const uploadedUrl = await uploadItemPhoto({
        uid: currentUid,
        itemId,
        localUri: pendingPhotoUri,
        originalWidth: pendingPhotoWidth,
      });
      return { photoUrl: uploadedUrl, photoUri: null };
    }

    if (!photoUrl && !photoUri) {
      return { photoUrl: null, photoUri: null };
    }

    return { photoUrl, photoUri };
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
    const t = norm(s);
    if (!t) return null;
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(t);
    if (!ok) return "INVALID";
    return t;
  }

  async function saveItem() {
    const b = norm(brand);
    const n = norm(name);

    const hasAtLeastOnePhoto = !!(pendingPhotoUri || photoUrl || photoUri);
    if (!hasAtLeastOnePhoto) {
      return Alert.alert("Missing photo", "Add at least one item photo.");
    }

    if (!uid) {
      router.replace("/(auth)/login");
      return Alert.alert("Not signed in", "Please sign in first.");
    }
    const priceNum = parsePriceToNumber(price);
    const date = parsePurchaseDate(purchaseDate);
    if (date === "INVALID") {
      return Alert.alert(
        "Bad date format",
        "Use YYYY-MM-DD (example: 2025-12-26) or leave it empty."
      );
    }

    const itemsRef = collection(db, "users", uid, "items");
    const itemRef = isEdit
      ? doc(db, "users", uid, "items", String(editItemId))
      : doc(itemsRef);

    const payloadBase = {
      brand: b || "",
      name: n || "",
      category,
      subCategory: isValidCategorySubCategory(category, subCategory)
        ? subCategory
        : null,
      wearSlot: wearSlot(category),
      colors: selectedColors.map(normColor).filter(Boolean),
      primaryColor: normColor(selectedColors[0] ?? ""),
      size: norm(size) || null,
      notes: norm(notes) || null,
      price: priceNum,
      purchaseDate: date,
      updatedAt: Date.now(),
    };

    try {
      setLoading(true);

      const nextPhoto = await resolvePhotoFields(uid, itemRef.id);
      const payload = {
        ...payloadBase,
        photoUrl: nextPhoto.photoUrl,
        photoUri: nextPhoto.photoUri,
        photos: {
          primaryUrl: nextPhoto.photoUrl,
          urls: nextPhoto.photoUrl ? [nextPhoto.photoUrl] : [],
        },
      };

      if (isEdit) {
        await updateDoc(itemRef, {
          ...payload,
          ...(pendingPhotoUri
            ? {
                ingestion: {
                  status: "pending",
                  lastRunAt: Date.now(),
                },
              }
            : {}),
        });
        Alert.alert("Saved ✅", "Item updated.");
        router.back();
        return;
      }

      await setDoc(itemRef, {
        ...payload,
        status: "AVAILABLE",
        wearCountSinceWash: 0,
        createdAt: Date.now(),
        lastWornDate: null,
        lastWashedDate: Date.now(),
        ingestion: {
          status: "pending",
          lastRunAt: Date.now(),
        },
      });

      Alert.alert("Added ✅", "Item added to wardrobe.");

      setBrand("");
      setName("");
      setCategory(Category.TOP);
      setSubCategory("");
      setSelectedColors([]);
      setCustomColor("");
      setAddingCustomColor(false);
      setSize("");
      setNotes("");
      setPrice("");
      setPurchaseDate("");
      setPhotoUrl(null);
      setPhotoUri(null);
      setPendingPhotoUri(null);
      setPendingPhotoWidth(null);
    } catch (e: any) {
      console.log(e);
      Alert.alert(
        "Error",
        e?.message ?? (isEdit ? "Failed to update item" : "Failed to add item")
      );
    } finally {
      setUploadingPhoto(false);
      setLoading(false);
    }
  }

  const canAddCustomColor = customColor.trim().length > 0;
  const canSave = !!category && !!(pendingPhotoUri || photoUrl || photoUri) && !loading;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Pressable onPress={() => router.back()} style={btnSecondary}>
          <Text style={btnSecondaryText}>Back</Text>
        </Pressable>

        <Text style={{ fontSize: 22, fontWeight: "800" }}>
          {isEdit ? "Edit Item" : "Add Item"}
        </Text>

        <View style={{ width: 60 }} />
      </View>

      {loading ? <Text>{uploadingPhoto ? "Uploading photo..." : "Loading..."}</Text> : null}

      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Photo</Text>

        {previewPhotoUri ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image
              source={{ uri: previewPhotoUri }}
              style={{
                width: 88,
                height: 88,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#ddd",
              }}
            />
            <View style={{ gap: 8 }}>
              <Pressable onPress={() => pickPhoto("library")} style={btnSecondary} disabled={loading}>
                <Text style={btnSecondaryText}>Change photo</Text>
              </Pressable>
              <Pressable onPress={() => pickPhoto("camera")} style={btnSecondary} disabled={loading}>
                <Text style={btnSecondaryText}>Use camera</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setPendingPhotoUri(null);
                  setPendingPhotoWidth(null);
                  setPhotoUrl(null);
                  setPhotoUri(null);
                }}
                style={btnSecondary}
                disabled={loading}
              >
                <Text style={btnSecondaryText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => pickPhoto("library")}
              style={[btnSecondary, { flex: 1 }]}
              disabled={loading}
            >
              <Text style={btnSecondaryText}>Pick from gallery</Text>
            </Pressable>
            <Pressable
              onPress={() => pickPhoto("camera")}
              style={[btnSecondary, { flex: 1 }]}
              disabled={loading}
            >
              <Text style={btnSecondaryText}>Use camera</Text>
            </Pressable>
          </View>
        )}

        {pendingPhotoUri ? (
          <Text style={{ color: "#666" }}>
            New photo selected. It will upload to Firebase Storage when you save.
          </Text>
        ) : null}
      </View>

      <Field label="Brand">
        <TextInput
          value={brand}
          onChangeText={setBrand}
          placeholder="e.g., Nike"
          style={input}
        />
      </Field>

      <Field label="Product name">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g., Air Jordan 2"
          style={input}
        />
      </Field>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CATEGORIES.map((cat) => (
            <Pill
              key={cat}
              label={cat}
              active={category === cat}
              onPress={() => {
                setCategory(cat);
                setSubCategory("");
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>
          Sub-category (optional)
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pill
            key="auto"
            label="Auto"
            active={!subCategory}
            onPress={() => setSubCategory("")}
          />
          {SUB_CATEGORIES[category].map((sub) => (
            <Pill
              key={sub}
              label={sub}
              active={subCategory === sub}
              onPress={() => setSubCategory(sub)}
            />
          ))}
        </View>
      </View>

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
          <Text style={{ color: "#666" }}>Selected: {selectedColors.join(" / ")}</Text>
        ) : null}
      </View>

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

      <Pressable
        onPress={saveItem}
        style={[btnPrimary, !canSave ? { opacity: 0.6 } : null]}
        disabled={!canSave}
      >
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
