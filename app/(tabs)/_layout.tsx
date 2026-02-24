import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
         href: null,
        }}
      />
      <Tabs.Screen
        name="item/[id]"
        options={{
         href: null,
        }}
        />
       <Tabs.Screen
         name="laundry"
         options={{
         title: "Laundry",
        }}
      />
      <Tabs.Screen
       name="today"
       options={{
       title: "Today",
       }}
      />
      <Tabs.Screen
       name="ai"
       options={{
       title: "AI",
       }}
      />
      <Tabs.Screen
       name="profile"
       options={{
       title: "Profile",
       }}
      />



    </Tabs>
  );
}
