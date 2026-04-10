import { router } from "expo-router";
import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { SafeScreen } from "@/src/components/SafeScreen";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import {
  ProfileHubRow,
  useAccountProfileState,
  formatBodyFitSummary,
  formatClosetSummary,
  formatDefaultSizesSummary,
  formatNotificationsSummary,
  formatStyleSummary,
  formatUnitsSummary,
  useProfilePreferencesState,
} from "@/src/profile/screens";

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const { user, loading, profile } = useProfilePreferencesState();
  const { accountProfile } = useAccountProfileState();
  const accountSummary = accountProfile.name
    ? `${accountProfile.name} • ${user?.email ?? "No email found."}`
    : user?.email ?? "No email found.";

  return (
    <SafeScreen backgroundColor={colors.background} includeBottomInset={false} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 0,
          gap: layout.sectionGap - 6,
          paddingBottom: layout.bottomDockPadding,
        }}
      >
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 28 * layout.titleScale, fontWeight: "900", color: colors.text }}>Profile</Text>
          <Text style={{ color: colors.textSecondary }}>
            Settings, sizing, and preferences.
          </Text>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <>
            <ProfileHubRow
              title="Account"
              summary={accountSummary}
              onPress={() => router.push("/profile/account")}
            />
            <ProfileHubRow
              title="Body & Fit"
              summary={formatBodyFitSummary(profile)}
              onPress={() => router.push("/profile/body-fit")}
            />
            <ProfileHubRow
              title="Default Sizes"
              summary={formatDefaultSizesSummary(profile)}
              onPress={() => router.push("/profile/default-sizes")}
            />
            <ProfileHubRow
              title="Units & Region"
              summary={formatUnitsSummary(profile)}
              onPress={() => router.push("/profile/units-region")}
            />
            <ProfileHubRow
              title="Style Preferences"
              summary={formatStyleSummary(profile)}
              onPress={() => router.push("/profile/style-preferences")}
            />
            <ProfileHubRow
              title="Closet Preferences"
              summary={formatClosetSummary(profile)}
              onPress={() => router.push("/profile/closet-preferences")}
            />
            <ProfileHubRow
              title="Notifications"
              summary={formatNotificationsSummary(profile)}
              onPress={() => router.push("/profile/notifications")}
            />
          </>
        )}
      </ScrollView>
    </SafeScreen>
  );
}
