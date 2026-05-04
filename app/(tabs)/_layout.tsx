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
        animation: 'none',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
       name="closet"
       options={{
       title: 'Closet',
       }}
      />
      <Tabs.Screen
       name="ai"
       options={{
       title: 'AURA',
       }}
      />
       <Tabs.Screen
         name="calendar"
         options={{
         title: 'Calendar',
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
         animation: 'none',
        }}
      />
      <Tabs.Screen
        name="item/[id]"
        options={{
         href: null,
         animation: 'none',
        }}
        />
      <Tabs.Screen
        name="laundry"
        options={{
         href: null,
         animation: 'none',
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
         href: null,
         animation: 'none',
        }}
      />
    </Tabs>
  );
}
