import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing, useColors } from '@/theme';
import {
  currentToast,
  dismissToast,
  subscribeToToasts,
  toastDuration,
  type Toast,
} from '@/utils/toast';

import { useReduceMotion } from '@/hooks/use-reduce-motion';

import { ThemedText } from './themed-text';

/** Renders the current notice as a banner under the status bar. Mounted once, at the root. */
export function ToastHost() {
  const toast = useSyncExternalStore(subscribeToToasts, currentToast);
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  // With Reduce Motion on, notices fade without sliding.
  const reduceMotion = useReduceMotion();

  const hide = useCallback(
    (t: Toast) => {
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() =>
        dismissToast(t.id),
      );
    },
    [opacity],
  );

  useEffect(() => {
    if (!toast) return;
    AccessibilityInfo.announceForAccessibility(
      [toast.title, toast.message].filter(Boolean).join('. '),
    );
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => hide(toast), toastDuration(toast));
    return () => clearTimeout(timer);
  }, [toast, opacity, hide]);

  if (!toast) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.host,
        {
          top: insets.top + spacing.sm,
          opacity,
          transform: [
            {
              translateY: opacity.interpolate({
                inputRange: [0, 1],
                outputRange: [reduceMotion ? 0 : -12, 0],
              }),
            },
          ],
        },
      ]}>
      <Toastlet toast={toast} onDismiss={() => hide(toast)} />
    </Animated.View>
  );
}

function Toastlet({ toast, onDismiss }: { toast: Toast; onDismiss(): void }) {
  const colors = useColors();
  const tone =
    toast.kind === 'error'
      ? colors.danger
      : toast.kind === 'success'
        ? colors.success
        : colors.holo;
  return (
    <Pressable
      accessibilityRole="alert"
      accessibilityHint="Tap to dismiss"
      onPress={onDismiss}
      style={[styles.toast, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <View style={[styles.stripe, { backgroundColor: tone }]} />
      <View style={styles.body}>
        <ThemedText variant="label" style={styles.title}>
          {toast.title}
        </ThemedText>
        {toast.message ? (
          <ThemedText variant="caption" color="textSecondary">
            {toast.message}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  stripe: { width: 4 },
  body: { flex: 1, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, gap: 2 },
  title: { fontSize: 15, lineHeight: 20 },
});
