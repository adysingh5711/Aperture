import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { JournalStackParamList } from '../types';
import JournalScreen from '../screens/JournalScreen';
import DayDetailScreen from '../screens/DayDetailScreen';
import { useTheme } from '../theme';

const Stack = createNativeStackNavigator<JournalStackParamList>();

export default function JournalStack() {
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
