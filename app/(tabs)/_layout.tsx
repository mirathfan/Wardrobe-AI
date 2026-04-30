import { Tabs } from 'expo-router';
import React from 'react';
import { Easing } from 'react-native';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import FloatingGlassTabBar from '@/components/FloatingGlassTabBar';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const forSoftTabFadeLift: NonNullable<
  BottomTabNavigationOptions['sceneStyleInterpolator']
> = ({ current }) => {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
      }),
      transform: [
        {
          translateY: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [8, 0, 8],
          }),
        },
        {
          scale: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [0.992, 1, 0.992],
          }),
        },
      ],
    },
  };
};

export default function TabLayout() {
  const reduceMotion = useReduceMotion();

  return (
    <Tabs
      tabBar={(props) => <FloatingGlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        animation: reduceMotion ? 'none' : 'fade',
        sceneStyleInterpolator: reduceMotion ? undefined : forSoftTabFadeLift,
        transitionSpec: reduceMotion
          ? undefined
          : {
              animation: 'timing',
              config: {
                duration: 220,
                easing: Easing.out(Easing.cubic),
              },
            },
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
