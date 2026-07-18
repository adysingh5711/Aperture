import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, BackHandler } from 'react-native';
import { alert } from '../components/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, depth, useTheme, useThemedStyles, ThemeColors } from '../theme';
import { ArrowRightIcon, BackspaceIcon } from '../components/icons';
import ApertureModule from '../native/ApertureModule';
import { ActiveSession } from '../types';

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
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
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
        ApertureModule.finalizeSession('system_timeout').finally(onRelease);
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
      alert('Incorrect', 'Please try again.');
      setAnswer('');
    }
  };

  const renderKeypad = () => {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'submit'];
    return (
      <View style={styles.keypad}>
        {keys.map(k => (
          <TouchableOpacity
            key={k}
            style={[styles.key, k === 'submit' && styles.keySubmit]}
            activeOpacity={0.6}
            accessibilityLabel={k === 'back' ? 'Backspace' : k === 'submit' ? 'Submit answer' : undefined}
            onPress={() => {
              if (k === 'back') setAnswer(prev => prev.slice(0, -1));
              else if (k === 'submit') handleSubmit();
              else setAnswer(prev => prev + k);
            }}
          >
            {k === 'back' ? (
              <BackspaceIcon size={26} color={colors.textSecondary} />
            ) : k === 'submit' ? (
              <ArrowRightIcon size={26} color={colors.ctaText} />
            ) : (
              <Text style={styles.keyText}>{k}</Text>
            )}
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

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.gateBg,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
  },
  countdown: {
    color: c.textPrimary,
    fontSize: 60,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  progress: {
    color: c.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  challengeArea: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  question: {
    color: c.textPrimary,
    fontSize: 40,
    fontWeight: '900',
    marginBottom: spacing.lg,
  },
  answerBox: {
    borderRadius: 0,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    minWidth: 150,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  answerText: {
    color: c.textPrimary,
    fontSize: 32,
    fontWeight: '900',
    fontFamily: 'monospace',
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
    backgroundColor: c.surface,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },
  // ponytail: plunk edge faked with thick right/bottom borders instead of the plate+face pattern — good enough for a static keypad key
  keySubmit: {
    backgroundColor: c.ctaFace,
    borderColor: c.ctaEdge,
    borderRightWidth: depth,
    borderBottomWidth: depth,
  },
  keyText: {
    color: c.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    includeFontPadding: false,
  },
  });
