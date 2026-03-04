import { Tabs } from 'expo-router';
import React from 'react';
import FloatingGlassTabBar from '@/components/FloatingGlassTabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingGlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
       name="today"
       options={{
       title: 'Today',
       }}
      />
      <Tabs.Screen
       name="ai"
       options={{
       title: 'AI',
       }}
      />
       <Tabs.Screen
         name="laundry"
         options={{
         title: 'Laundry',
        }}
      />
      <Tabs.Screen
       name="profile"
       options={{
       title: 'Profile',
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
    </Tabs>
  );
}
