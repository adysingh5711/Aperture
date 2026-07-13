import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AppTabParamList } from '../types';
import TodayScreen from '../screens/TodayScreen';
import JournalStack from './JournalStack';
import PatternsScreen from '../screens/PatternsScreen';
import SettingsStack from './SettingsStack';
import { colors } from '../theme';
import { Text } from 'react-native';

const Tab = createBottomTabNavigator<AppTabParamList>();

// ponytail: unicode tab icons. Ceiling: no filled/outlined variants. Upgrade: react-native-vector-icons
function TabIcon({ char, color }: { char: string; color: string }) {
  return <Text style={{ color, fontSize: 20 }}>{char}</Text>;
}

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.action,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarIcon: ({ color }) => <TabIcon char="⏱" color={color} />,
          tabBarLabel: ({ focused, color }) => focused ? <Text style={{ color, fontSize: 10 }}>Today</Text> : null,
        }}
      />
      <Tab.Screen
        name="JournalTab"
        component={JournalStack}
        options={{
          title: 'Journal',
          tabBarIcon: ({ color }) => <TabIcon char="▩" color={color} />,
          tabBarLabel: ({ focused, color }) => focused ? <Text style={{ color, fontSize: 10 }}>Journal</Text> : null,
        }}
      />
      <Tab.Screen
        name="Patterns"
        component={PatternsScreen}
        options={{
          tabBarIcon: ({ color }) => <TabIcon char="📊" color={color} />,
          tabBarLabel: ({ focused, color }) => focused ? <Text style={{ color, fontSize: 10 }}>Patterns</Text> : null,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStack}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon char="⚙" color={color} />,
          tabBarLabel: ({ focused, color }) => focused ? <Text style={{ color, fontSize: 10 }}>Settings</Text> : null,
        }}
      />
    </Tab.Navigator>
  );
}
