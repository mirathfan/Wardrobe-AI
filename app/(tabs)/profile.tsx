import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { SafeScreen } from "@/src/components/SafeScreen";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { LookDetailModal } from "@/src/components/profile/LookDetailModal";
import { MyLookSkeleton, MyLookThumbnail } from "@/src/components/profile/MyLookThumbnail";
import { AuraSkeleton, AuraSkeletonLine } from "@/src/components/ui/AuraSkeleton";
import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraCardStyle,
  AuraTopSafeAreaScrim,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { listenToItems, toCanonicalCategory, type ClosetItem } from "@/src/lib/items";
import { subscribeFavouriteLooks, subscribeProfileFeedbackLooks, type ProfileLookRecord } from "@/src/lib/profileLooks";
import { loadUserAccountProfile, loadUserProfilePreferences } from "@/src/lib/userProfile";
import {
  ProfileHubRow,
  useAccountProfileState,
  formatBodyFitSummary,
  formatClosetSummary,
  formatDefaultSizesSummary,
  formatShoppingSummary,
  formatStyleSummary,
  formatUnitsSummary,
  useProfilePreferencesState,
} from "@/src/profile/screens";
import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";

type StatCardProps = {
  label: string;
  value: string;
  onPress: () => void;
};

const SETTINGS_GROUPS = [
  {
    label: "ACCOUNT",
    rows: [
      { title: "Account", route: "/profile/account", summary: "account" },
    ],
  },
  {
    label: "STYLE PROFILE",
    rows: [
      { title: "Saved Outfits", route: "/saved-outfits", summary: "savedOutfits" },
      { title: "Body & Fit", route: "/profile/body-fit", summary: "bodyFit" },
      { title: "Default Sizes", route: "/profile/default-sizes", summary: "defaultSizes" },
      { title: "Shopping Preferences", route: "/profile/shopping-preferences", summary: "shopping" },
      { title: "Style Preferences", route: "/profile/style-preferences", summary: "style" },
      { title: "Closet Preferences", route: "/profile/closet-preferences", summary: "closet" },
    ],
  },
  {
    label: "SYSTEM",
    rows: [
      { title: "Units & Region", route: "/profile/units-region", summary: "units" },
    ],
  },
] as const;

function humanize(value?: string | null) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactHumanize(value?: string | null) {
  const text = humanize(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "";
}

function getDisplayName(name?: string | null, email?: string | null, fallback?: string | null) {
  return name || fallback || email?.split("@")[0] || "AURA member";
}

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "A";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1];
  return `${first}${second ?? ""}`.toUpperCase();
}

function summarizeStyleIdentity(profile: UserProfilePreferences) {
  const style =
    profile.stylePreferences.preferredStyles?.[0] ||
    profile.styleAesthetics?.[0] ||
    profile.occasionPriority?.[0] ||
    "Personal style";
  const fit = profile.preferredFit || profile.fitPreferences.tops || "regular";
  return `${compactHumanize(style)} · ${compactHumanize(fit)} fit`;
}

function summarizeAuraRead(profile: UserProfilePreferences) {
  const descriptors = [
    ...(profile.stylePreferences.preferredStyles ?? []),
    profile.preferredFit,
    ...(profile.stylePreferences.favoriteColors ?? []),
  ]
    .filter(Boolean)
    .slice(0, 3)
    .map((entry) => compactHumanize(entry).toLowerCase());

  if (descriptors.length >= 2) {
    return `AURA reads your style as ${descriptors.join(", ")}.`;
  }
  return "AURA reads your style as clean, relaxed, and street-smart.";
}

function valueCounts(values: string[]) {
  return values.reduce((counts, value) => {
    const key = value.trim();
    if (!key) return counts;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function mostCommon(values: string[]) {
  const counts = valueCounts(values);
  let winner = "";
  let winnerCount = 0;
  counts.forEach((count, value) => {
    if (count > winnerCount) {
      winner = value;
      winnerCount = count;
    }
  });
  return winner;
}

function getItemColor(item: ClosetItem) {
  return (
    item.primaryColor ||
    item.displayColor ||
    item.colorLabel ||
    item.aiColorLabel ||
    item.colors?.[0] ||
    item.displayColors?.[0] ||
    item.aiColors?.[0] ||
    ""
  );
}

function buildProfileFacts(profile: UserProfilePreferences, items: ClosetItem[]) {
  const styles = profile.stylePreferences.preferredStyles?.length
    ? profile.stylePreferences.preferredStyles
    : profile.styleAesthetics;
  const styleSummary = styles?.length
    ? styles.slice(0, 3).map(humanize).join(" · ")
    : "Add a few style preferences to sharpen AURA's read.";
  const fit = profile.preferredFit || profile.fitPreferences.tops || profile.fitPreferences.outerwear || "";
  const commonColor = mostCommon(items.map(getItemColor).filter(Boolean));
  const commonCategory = mostCommon(items.map((item) => toCanonicalCategory(item.category)).filter(Boolean));
  const favoriteColor = profile.stylePreferences.favoriteColors?.[0] || profile.favoriteColors?.[0] || "";
  const colorOrCategory = commonColor || favoriteColor || commonCategory;
  const relaxed = fit === "relaxed" || fit === "oversized" || profile.fitPreferences.outerwear === "roomy";
  const casual = styles?.some((entry) => /casual|street|minimal|sport|everyday/i.test(entry));
  const closetNote = relaxed || casual
    ? "You lean relaxed and casual. Add one lighter layer or sharper shoe to expand your outfit range."
    : "Your closet has a steady base. Add one contrast layer or signature accessory to widen the range.";

  return {
    styleSummary,
    fitSummary: fit ? `${humanize(fit)} fit` : "Fit preference not set",
    colorOrCategory: colorOrCategory ? humanize(colorOrCategory) : "Not enough closet signal yet",
    closetNote,
  };
}

function isUnworn(item: ClosetItem) {
  return Number(item.wearCountSinceWash ?? 0) === 0 && !item.lastWornDate;
}

function StatCard({ label, value, onPress }: StatCardProps) {
  const { colors } = useAppTheme();
  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.97}
      pressedOpacity={0.88}
      style={{
        flex: 1,
        minWidth: 72,
        ...auraCardStyle(colors, "inset"),
        paddingHorizontal: 10,
        paddingVertical: 12,
        gap: 4,
      }}
    >
      <Text style={[auraTypography.sectionTitle, { color: colors.text, fontWeight: "600" }]}>{value}</Text>
      <Text style={[auraTypography.caption, { color: colors.textSecondary, fontSize: 11, lineHeight: 15 }]}>{label}</Text>
    </AuraPressable>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text style={[auraTypography.eyebrow, { color: colors.textSecondary, letterSpacing: 1.2 }]}>
      {children}
    </Text>
  );
}

function ProfileLoadingSkeleton() {
  const layout = useResponsiveLayout();
  return (
    <View style={{ gap: 18 }}>
      <AuraSkeleton height={156} radius={layout.largeRadius} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <AuraSkeleton key={index} height={74} radius={layout.mediumRadius} style={{ flex: 1 }} />
        ))}
      </View>
      <AuraSkeletonLine width="32%" height={12} />
      <AuraSkeleton height={150} radius={layout.mediumRadius} />
      <AuraSkeletonLine width="28%" height={12} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <AuraSkeleton key={index} width={112} height={136} radius={18} />
        ))}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const { user, loading, profile, setProfile } = useProfilePreferencesState();
  const { accountProfile, setAccountProfile } = useAccountProfileState();
  const [favouriteLooks, setFavouriteLooks] = useState<ProfileLookRecord[]>([]);
  const [likedLooks, setLikedLooks] = useState<ProfileLookRecord[]>([]);
  const [looksLoading, setLooksLoading] = useState(true);
  const [likedLooksLoading, setLikedLooksLoading] = useState(true);
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [selectedLook, setSelectedLook] = useState<ProfileLookRecord | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const displayName = getDisplayName(accountProfile.name, user?.email, user?.displayName);
  const accountSummary = accountProfile.name
    ? `${accountProfile.name} • ${user?.email ?? "No email found."}`
    : user?.email ?? "No email found.";
  const profileFacts = useMemo(() => buildProfileFacts(profile, items), [items, profile]);

  const stats = useMemo(() => {
    const savedLookCount = likedLooks.length + favouriteLooks.length;
    return [
      { label: "Closet items", value: itemsLoading ? "—" : String(items.length), onPress: () => router.push("/(tabs)/closet") },
      { label: "Saved looks", value: looksLoading || likedLooksLoading ? "—" : String(savedLookCount), onPress: () => router.push("/profile/my-looks") },
      { label: "Unworn", value: itemsLoading ? "—" : String(items.filter(isUnworn).length), onPress: () => router.push("/(tabs)/closet") },
      {
        label: "Favourites",
        value: looksLoading ? "—" : String(favouriteLooks.length),
        onPress: () => router.push({ pathname: "/profile/my-looks", params: { tab: "favourites" } }),
      },
    ];
  }, [favouriteLooks.length, items, itemsLoading, likedLooks.length, likedLooksLoading, looksLoading]);

  const summaries = useMemo(
    () => ({
      account: accountSummary,
      savedOutfits: "View AURA outfits you saved for repeat wear.",
      bodyFit: formatBodyFitSummary(profile),
      defaultSizes: formatDefaultSizesSummary(profile),
      shopping: formatShoppingSummary(profile),
      style: formatStyleSummary(profile),
      closet: formatClosetSummary(profile),
      units: formatUnitsSummary(profile),
    }),
    [accountSummary, profile],
  );

  useEffect(() => {
    if (!user?.uid) {
      setFavouriteLooks([]);
      setLooksLoading(false);
      return;
    }
    setLooksLoading(true);
    return subscribeFavouriteLooks(
      user.uid,
      (records) => {
        setFavouriteLooks(records);
        setLooksLoading(false);
      },
      () => {
        setFavouriteLooks([]);
        setLooksLoading(false);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setLikedLooks([]);
      setLikedLooksLoading(false);
      return;
    }
    setLikedLooksLoading(true);
    return subscribeProfileFeedbackLooks(
      user.uid,
      "outfit_liked",
      (records) => {
        setLikedLooks(records);
        setLikedLooksLoading(false);
      },
      () => {
        setLikedLooks([]);
        setLikedLooksLoading(false);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setItems([]);
      setItemsLoading(false);
      return;
    }
    setItems([]);
    setItemsLoading(true);
    return listenToItems(user.uid, (nextItems) => {
      setItems(nextItems);
      setItemsLoading(false);
    }, {
      onError: () => {
        setItems([]);
        setItemsLoading(false);
      },
    });
  }, [user?.uid]);

  const handleRefresh = React.useCallback(async () => {
    if (!user?.uid || refreshing) return;
    setRefreshing(true);
    const startedAt = Date.now();
    try {
      const [nextProfile, nextAccountProfile] = await Promise.all([
        loadUserProfilePreferences(user.uid),
        loadUserAccountProfile(user.uid),
      ]);
      setProfile(nextProfile);
      setAccountProfile(nextAccountProfile);
    } catch {
      // Live subscriptions keep the visible profile from going stale if a manual refresh fails.
    } finally {
      const remaining = Math.max(0, 450 - (Date.now() - startedAt));
      setTimeout(() => setRefreshing(false), remaining);
    }
  }, [refreshing, setAccountProfile, setProfile, user?.uid]);

  const openMyLooks = () => router.push("/profile/my-looks");
  const openFavourites = () => router.push({ pathname: "/profile/my-looks", params: { tab: "favourites" } });
  const previewLooks = favouriteLooks.slice(0, 5);

  return (
    <SafeScreen backgroundColor={colors.background} includeBottomInset={false} style={{ flex: 1 }}>
      <AuraTopSafeAreaScrim color={colors.background} />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.ctaCream}
            colors={[colors.ctaCream]}
            progressBackgroundColor={colors.background}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 0,
          gap: 18,
          paddingBottom: layout.bottomDockPadding + 48,
        }}
      >
        <View style={{ gap: 5 }}>
          <Text style={[auraTypography.screenTitle, { fontSize: 28 * layout.titleScale, lineHeight: 34 * layout.titleScale, color: colors.text }]}>Profile</Text>
          <Text style={[auraTypography.body, { color: colors.textSecondary, opacity: 0.76 }]}>
            Your style identity, closet signal, and preferences.
          </Text>
        </View>

        {loading ? (
          <ProfileLoadingSkeleton />
        ) : (
          <>
            <LinearGradient
              colors={[colors.surfaceElevated, colors.surface, colors.background] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                ...auraCardStyle(colors, "largeGlass"),
                borderColor: colors.borderStrong,
                padding: 18,
                overflow: "hidden",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: 34,
                    borderWidth: 1,
                    borderColor: colors.borderStrong,
                    backgroundColor: colors.surfaceMuted,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {user?.photoURL ? (
                    <Image source={{ uri: user.photoURL }} style={{ width: 68, height: 68 }} />
                  ) : (
                    <Text style={{ color: colors.text, fontSize: 22, fontWeight: "600" }}>
                      {getInitials(displayName)}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ color: colors.text, fontSize: 23, fontWeight: "600" }} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                        {user?.email ?? "No email found."}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => router.push("/profile/account")}
                      style={{
                        ...auraButtonStyle(colors, "tertiary", false, "compact"),
                        minHeight: 44,
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text style={[auraButtonTextStyle(colors, "tertiary"), { color: colors.text, fontSize: 12 }]}>Edit</Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "500" }} numberOfLines={1}>
                    {summarizeStyleIdentity(profile)}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  marginTop: 16,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: 14,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22, fontWeight: "400" }}>
                  {summarizeAuraRead(profile)}
                </Text>
              </View>
            </LinearGradient>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {stats.map((stat) => (
                <StatCard key={stat.label} label={stat.label} value={stat.value} onPress={stat.onPress} />
              ))}
            </View>

            <View style={{ gap: 12 }}>
              <SectionLabel>AURA PROFILE</SectionLabel>
              <View
                style={{
                  ...auraCardStyle(colors, "card"),
                  padding: 16,
                  gap: 12,
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "500" }}>Style preferences</Text>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600", lineHeight: 21 }}>
                    {profileFacts.styleSummary}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "500" }}>Fit</Text>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{profileFacts.fitSummary}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "500" }}>Top signal</Text>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{profileFacts.colorOrCategory}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                  {profileFacts.closetNote}
                </Text>
                <Pressable
                  onPress={() => router.push("/profile/style-preferences")}
                  style={{
                    alignSelf: "flex-start",
                    ...auraButtonStyle(colors, "secondary", false, "compact"),
                    minHeight: 44,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text style={[auraButtonTextStyle(colors, "secondary"), { color: colors.textSecondary, fontSize: 13 }]}>
                    Edit style profile
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <SectionLabel>MY LOOKS</SectionLabel>
                <Pressable onPress={openMyLooks} style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500" }}>See all →</Text>
                </Pressable>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingRight: 2 }}
              >
                {looksLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <MyLookSkeleton key={index} width={112} height={136} />
                  ))
                ) : previewLooks.length ? (
                  previewLooks.map((record) => (
                    <MyLookThumbnail
                      key={`${record.collection}-${record.id}`}
                      record={record}
                      width={112}
                      height={136}
                      showInfo={false}
                      onPress={() => setSelectedLook(record)}
                    />
                  ))
                ) : (
                  <Pressable
                    onPress={openFavourites}
                    style={{
                      minHeight: 104,
                      width: 250,
                      ...auraCardStyle(colors, "card"),
                      paddingHorizontal: 16,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: "center" }}>
                      Save looks from AURA to build your style archive.
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            </View>

            <View style={{ gap: 18 }}>
              {SETTINGS_GROUPS.map((group) => (
                <View key={group.label} style={{ gap: 10 }}>
                  <SectionLabel>{group.label}</SectionLabel>
                  <View style={{ gap: 10 }}>
                    {group.rows.map((row) => (
                      <ProfileHubRow
                        key={row.title}
                        title={row.title}
                        summary={summaries[row.summary]}
                        onPress={() => router.push(row.route as Href)}
                      />
                    ))}
                  </View>
                </View>
              ))}
              {__DEV__ ? (
                <View style={{ gap: 10 }}>
                  {/* TODO: Remove or protect Developer tools before production launch. */}
                  <SectionLabel>Developer</SectionLabel>
                  <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
                    Internal tools for testing AURA intelligence, indexing, and backend workflows.
                  </Text>
                  <View style={{ gap: 10 }}>
                    <ProfileHubRow
                      title="AURA Intelligence Debug"
                      summary="Preview metadata, reindex an item, and run Phase 1 backfill."
                      onPress={() => router.push("/dev/intelligence-debug" as Href)}
                    />
                  </View>
                </View>
              ) : null}
            </View>

            <Text
              style={{
                marginTop: 24,
                textAlign: "center",
                color: colors.text,
                fontSize: 11,
                opacity: 0.15,
                fontWeight: "600",
              }}
            >
              AURA
            </Text>
          </>
        )}
      </ScrollView>
      <LookDetailModal
        visible={Boolean(selectedLook)}
        record={selectedLook}
        onClose={() => setSelectedLook(null)}
      />
    </SafeScreen>
  );
}
