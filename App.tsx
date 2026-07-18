import React, { useState, useEffect, useRef } from 'react';
import { Appearance, StatusBar } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import GateScreen from './src/screens/GateScreen';
import ApertureModule from './src/native/ApertureModule';
import { ActiveSession } from './src/types';
import { useTheme } from './src/theme';
import { AlertHost } from './src/components/alert';

export default function App() {
  const { colors, isDark } = useTheme();
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const lastSessionJson = useRef<string | null>(null);

  const checkGate = async () => {
    try {
      const sessionJson = await ApertureModule.getActiveSession();
      // Skip identical polls so the 2s interval never re-renders the tree.
      if (sessionJson === lastSessionJson.current) return;
      lastSessionJson.current = sessionJson;
      if (sessionJson) {
        const session = JSON.parse(sessionJson) as ActiveSession;
        if (session.status === 'gate_active') {
          setActiveSession(session);
        } else {
          setActiveSession(null);
        }
      } else {
        setActiveSession(null);
      }
    } catch {
      lastSessionJson.current = null;
      setActiveSession(null);
    }
  };

  // Apply persisted theme override; useColorScheme() reflects it app-wide.
  useEffect(() => {
    ApertureModule.getSettings()
      .then(s => {
        const mode = s.themeMode ?? 'system';
        Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    checkGate();
    const interval = setInterval(checkGate, 2000);
    return () => clearInterval(interval);
  }, []);

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={activeSession ? colors.gateBg : colors.background}
      />
      {activeSession ? (
        <GateScreen session={activeSession} onRelease={() => setActiveSession(null)} />
      ) : (
        <NavigationContainer theme={navTheme}>
          <AppNavigator />
        </NavigationContainer>
      )}
      <AlertHost />
    </SafeAreaProvider>
  );
}
