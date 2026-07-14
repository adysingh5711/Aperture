import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radii } from '../theme';
import ApertureModule from '../native/ApertureModule';
import { ActiveSession } from '../types';
import { formatTimeShort } from '../utils/formatters';

interface Step {
  operandA: number;
  operation: string;
  operandB: number;
  correctAnswer: number;
}

// Ported from ChallengeEngine.kt
class JSChallengeEngine {
  private steps: Step[] = [];

  constructor(seed: string, difficulty: string) {
    const random = this.createRandom(this.hashString(seed));
    const config = this.getDifficultyConfig(difficulty);

    for (let i = 0; i < config.stepCount; i++) {
      this.steps.push(this.generateStep(random, config));
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  private createRandom(seed: number) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  private getDifficultyConfig(difficulty: string) {
    switch (difficulty.toLowerCase()) {
      case 'light': return { stepCount: 3, minDigits: 2, maxDigits: 3 };
      case 'hard': return { stepCount: 6, minDigits: 4, maxDigits: 6 };
      default: return { stepCount: 5, minDigits: 3, maxDigits: 5 };
    }
  }

  private generateStep(random: () => number, config: any): Step {
    const ops = ['+', '-', '×', '÷'];
    const op = ops[Math.floor(random() * ops.size)]; // Wait, ops.size is Java. JS is length.

    // Fixed: Math.floor(random() * ops.length)
    const opActual = ops[Math.floor(random() * ops.length)];

    const minVal = Math.pow(10, config.minDigits - 1);
    const maxVal = Math.pow(10, config.maxDigits) - 1;

    const nextRandomLong = (min: number, max: number) => {
      return Math.floor(random() * (max - min + 1)) + min;
    };

    switch (opActual) {
      case '+': {
        const a = nextRandomLong(minVal, maxVal);
        const b = nextRandomLong(minVal, maxVal);
        return { operandA: a, operation: '+', operandB: b, correctAnswer: a + b };
      }
      case '-': {
        let a = nextRandomLong(minVal, maxVal);
        let b = nextRandomLong(minVal, maxVal);
        if (a < b) [a, b] = [b, a];
        return { operandA: a, operation: '-', operandB: b, correctAnswer: a - b };
      }
      case '×': {
        const a = nextRandomLong(2, 99);
        const b = nextRandomLong(2, 999);
        return { operandA: a, operation: '×', operandB: b, correctAnswer: a * b };
      }
      case '÷': {
        const divisor = nextRandomLong(2, 99);
        const answer = nextRandomLong(Math.floor(minVal / 10) + 1, Math.floor(maxVal / 100) + 1);
        const dividend = divisor * answer;
        return { operandA: dividend, operation: '÷', operandB: divisor, correctAnswer: answer };
      }
      default: return { operandA: 1, operation: '+', operandB: 1, correctAnswer: 2 };
    }
  }

  getStep(index: number) { return this.steps[index]; }
  get totalSteps() { return this.steps.length; }
}

export default function GateScreen({ session, onRelease }: { session: ActiveSession, onRelease: () => void }) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(session.operationIndex);
  const [answer, setAnswer] = useState('');
  const [difficulty, setDifficulty] = useState('standard');
  const [countdown, setCountdown] = useState('');

  // Prevent back button on Android
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    ApertureModule.getSettings().then(s => setDifficulty(s.difficulty));
  }, []);

  const engine = useMemo(() => new JSChallengeEngine(session.challengeSeed, difficulty), [session.challengeSeed, difficulty]);
  const currentStep = engine.getStep(stepIndex);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((session.endAtElapsedMs - Date.now()) / 1000));
      if (remaining === 0) {
        clearInterval(timer);
        onRelease(); // Timeout
      } else {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        setCountdown(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [session.endAtElapsedMs, onRelease]);

  const handleSubmit = async () => {
    if (parseInt(answer) === currentStep.correctAnswer) {
      const nextIndex = stepIndex + 1;
      if (nextIndex >= engine.totalSteps) {
        // Solved!
        await ApertureModule.finalizeSession('system_solve');
        onRelease();
      } else {
        setStepIndex(nextIndex);
        setAnswer('');
        await ApertureModule.updateOperationIndex(nextIndex);
      }
    } else {
      Alert.alert('Incorrect', 'Please try again.');
      setAnswer('');
    }
  };

  const renderKeypad = () => {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '→'];
    return (
      <View style={styles.keypad}>
        {keys.map(k => (
          <TouchableOpacity
            key={k}
            style={styles.key}
            onPress={() => {
              if (k === '⌫') setAnswer(prev => prev.slice(0, -1));
              else if (k === '→') handleSubmit();
              else setAnswer(prev => prev + k);
            }}
          >
            <Text style={styles.keyText}>{k}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.countdown}>{countdown}</Text>
        <Text style={styles.progress}>Step {stepIndex + 1} / {engine.totalSteps}</Text>
      </View>

      <View style={styles.challengeArea}>
        <Text style={styles.question}>
          {currentStep.operandA} {currentStep.operation} {currentStep.operandB}
        </Text>
        <View style={styles.answerBox}>
          <Text style={styles.answerText}>{answer || '?'}</Text>
        </View>
      </View>

      {renderKeypad()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
  },
  countdown: {
    color: '#EF4444',
    fontSize: 48,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  progress: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: spacing.xs,
  },
  challengeArea: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  question: {
    color: colors.textPrimary,
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: spacing.lg,
  },
  answerBox: {
    borderBottomWidth: 2,
    borderBottomColor: colors.action,
    minWidth: 150,
    alignItems: 'center',
    paddingBottom: spacing.xs,
  },
  answerText: {
    color: colors.action,
    fontSize: 32,
    fontWeight: 'bold',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
  },
  key: {
    width: '28%',
    aspectRatio: 1,
    backgroundColor: '#1E293B',
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyText: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: 40,
  },
});
