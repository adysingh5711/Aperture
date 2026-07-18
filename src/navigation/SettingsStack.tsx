import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsStackParamList } from '../types';
import SettingsScreen from '../screens/SettingsScreen';
import SoundLibraryScreen from '../screens/SoundLibraryScreen';
import { useTheme } from '../theme';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '900' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <Stack.Screen
        name="SoundLibrary"
        component={SoundLibraryScreen}
        options={{ title: 'Sound Library' }}
      />
    </Stack.Navigator>
  );
}
