import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AppTabParamList } from '../types';
import TodayScreen from '../screens/TodayScreen';
import JournalStack from './JournalStack';
import PatternsScreen from '../screens/PatternsScreen';
import SettingsStack from './SettingsStack';
import { useTheme } from '../theme';
import { Text } from 'react-native';
import { TimerIcon, JournalIcon, ChartIcon, SettingsIcon } from '../components/icons';

const Tab = createBottomTabNavigator<AppTabParamList>();

function TabLabel({ text, color }: { text: string; color: string }) {
  return (
    <Text style={{ color, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 }}>
      {text.toUpperCase()}
    </Text>
  );
}

export default function AppNavigator() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
        },
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarIcon: ({ color }) => <TimerIcon size={22} color={color} />,
          tabBarLabel: ({ focused, color }) =>
            focused ? <TabLabel text="Today" color={color} /> : null,
        }}
      />
      <Tab.Screen
        name="JournalTab"
        component={JournalStack}
        options={{
          title: 'Journal',
          tabBarIcon: ({ color }) => <JournalIcon size={22} color={color} />,
          tabBarLabel: ({ focused, color }) =>
            focused ? <TabLabel text="Journal" color={color} /> : null,
        }}
      />
      <Tab.Screen
        name="Patterns"
        component={PatternsScreen}
        options={{
          tabBarIcon: ({ color }) => <ChartIcon size={22} color={color} />,
          tabBarLabel: ({ focused, color }) =>
            focused ? <TabLabel text="Patterns" color={color} /> : null,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStack}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <SettingsIcon size={22} color={color} />,
          tabBarLabel: ({ focused, color }) =>
            focused ? <TabLabel text="Settings" color={color} /> : null,
        }}
      />
    </Tab.Navigator>
  );
}
