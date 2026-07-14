import React, { useState, useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import GateScreen from './src/screens/GateScreen';
import ApertureModule from './src/native/ApertureModule';
import { ActiveSession } from './src/types';
import { colors } from './src/theme';

export default function App() {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);

  const checkGate = async () => {
    try {
      const sessionJson = await ApertureModule.getActiveSession();
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
    } catch (e) {
      setActiveSession(null);
    }
  };

  useEffect(() => {
    checkGate();
    const interval = setInterval(checkGate, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
      {activeSession ? (
        <GateScreen session={activeSession} onRelease={() => setActiveSession(null)} />
      ) : (
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}
