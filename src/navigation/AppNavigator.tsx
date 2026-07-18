import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { AppTabParamList } from '../types';
import TodayScreen from '../screens/TodayScreen';
import JournalStack from './JournalStack';
import PatternsScreen from '../screens/PatternsScreen';
import SettingsStack from './SettingsStack';
import { useTheme } from '../theme';
import { TimerIcon, JournalIcon, ChartIcon, SettingsIcon } from '../components/icons';

const Tab = createBottomTabNavigator<AppTabParamList>();

export default function AppNavigator() {
  const { colors, isDark } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          shadowOpacity: 0,
          height: 60,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '800',
          letterSpacing: 1.5,
        },
        // Default Android ripple is a dark oval that ignores the theme.
        tabBarButton: props => (
          <PlatformPressable
            {...props}
            pressColor={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
            pressOpacity={0.7}
          />
        ),
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarLabel: 'TODAY',
          tabBarIcon: ({ color }) => <TimerIcon size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="JournalTab"
        component={JournalStack}
        options={{
          title: 'Journal',
          tabBarLabel: 'JOURNAL',
          tabBarIcon: ({ color }) => <JournalIcon size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Patterns"
        component={PatternsScreen}
        options={{
          tabBarLabel: 'PATTERNS',
          tabBarIcon: ({ color }) => <ChartIcon size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStack}
        options={{
          title: 'Settings',
          tabBarLabel: 'SETTINGS',
          tabBarIcon: ({ color }) => <SettingsIcon size={22} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
