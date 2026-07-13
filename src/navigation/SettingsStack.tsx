import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsStackParamList } from '../types';
import SettingsScreen from '../screens/SettingsScreen';
import SoundLibraryScreen from '../screens/SoundLibraryScreen';
import { colors } from '../theme';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        contentStyle: {
          backgroundColor: colors.surface,
        },
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
