import { router } from "expo-router";
import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { SafeScreen } from "@/src/components/SafeScreen";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import {
  ProfileHubRow,
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
  const { user, loading, profile } = useProfilePreferencesState();

  return (
    <SafeScreen backgroundColor={colors.background} edges={["top"]} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 28, fontWeight: "900", color: colors.text }}>Profile</Text>
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
              summary={user?.email ?? "No email found."}
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
