import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { JournalStackParamList } from '../types';
import JournalScreen from '../screens/JournalScreen';
import DayDetailScreen from '../screens/DayDetailScreen';
import { colors } from '../theme';

const Stack = createNativeStackNavigator<JournalStackParamList>();

export default function JournalStack() {
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
        name="JournalHome"
        component={JournalScreen}
        options={{ title: 'Journal' }}
      />
      <Stack.Screen
        name="DayDetail"
        component={DayDetailScreen}
        options={({ route }) => ({ title: route.params.date })}
      />
    </Stack.Navigator>
  );
}
