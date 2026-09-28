import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { searchTermFor } from '@/api/scan';
import type { ScanMatch } from '@/api/schemas';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { GuideOverlay } from '@/components/scan/guide-overlay';
import { ScanCandidates } from '@/components/scan/scan-candidates';
import { ScanConfirm, type ScanChoice } from '@/components/scan/scan-confirm';
import { EmptyState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAddFromScan, useIsOnline } from '@/hooks/queries';
import { useScanFlow } from '@/hooks/use-scan-flow';
import { minTapTarget, radius, spacing, useColors } from '@/theme';
import { guideRect, type Size } from '@/utils/crop';

/**
 * Scan a card: fit it in the guide, take the photo, pick the right match,
 * confirm, and the camera is ready for the next card. A running tally counts
 * what this visit has added.
 */
export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) return <ThemedView style={styles.fill} />;
  if (!permission.granted) {
    return (
      <ThemedView style={styles.fill}>
        <SafeAreaView style={styles.fill}>
          <EmptyState
            title="Camera access"
            message="Scanning takes a photo of a card and sends it to your PokeCollector server to recognize. Nothing else is recorded."
            action={
              permission.canAskAgain
                ? { title: 'Allow the camera', onPress: () => requestPermission() }
                : { title: 'Open Settings', onPress: () => Linking.openSettings() }
            }
          />
        </SafeAreaView>
      </ThemedView>
    );
  }
  return <Scanner />;
}

function Scanner() {
  const colors = useColors();
  const focused = useIsFocused();
  const online = useIsOnline();
  const flow = useScanFlow();
  const add = useAddFromScan();
  const camera = useRef<CameraView>(null);
  const [view, setView] = useState<Size | null>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [tally, setTally] = useState(0);
  const [selected, setSelected] = useState<ScanMatch | null>(null);
  const { state } = flow;
  const guide = view ? guideRect(view) : null;

  async function shoot() {
    if (!camera.current || !view || capturing) return;
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9, shutterSound: false });
      await flow.capture(photo, view);
    } finally {
      setCapturing(false);
    }
  }

  function confirm(match: ScanMatch, choice: ScanChoice) {
    if (state.step !== 'results') return;
    add.mutate(
      {
        jobId: state.jobId,
        itemId: state.itemId,
        add: {
          card_id: match.id,
          confirmedCardId: match.tcg_card_id,
          lang: match.lang ?? state.recognized?.language ?? 'en',
          ...choice,
        },
      },
      {
        onSuccess: () => {
          setTally((t) => t + choice.quantity);
          setSelected(null);
          // Resolved upstream already; nothing to delete.
          flow.reset({ keepJob: true });
        },
      },
    );
  }

  function searchInstead(term: string) {
    setSelected(null);
    flow.reset();
    router.navigate({ pathname: '/search', params: { q: term } });
  }

  const busy = state.step === 'uploading' || state.step === 'waiting';
  const recognized = 'recognized' in state ? state.recognized : null;
  const term = searchTermFor(recognized);

  return (
    <ThemedView style={styles.fill}>
      {/*
        The bottom safe area of a tab's content includes the tab bar, so the
        camera, the guide and every control sit above it. The crop is worked
        out from this same view, so it still matches the guide.
      */}
      <SafeAreaView edges={['bottom']} style={styles.fill}>
        <View
          style={styles.fill}
          onLayout={(e) =>
            setView({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
          }>
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="back"
            active={focused}
            enableTorch={torch && focused}
            animateShutter
            onCameraReady={() => setReady(true)}
          />
          {guide && view ? (
            <GuideOverlay view={view} guide={guide} active={state.step === 'camera'} />
          ) : null}

          <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
            <View style={styles.topRow} pointerEvents="box-none">
              {tally > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${tally} added this session. Reset the count`}
                  onLongPress={() => setTally(0)}
                  style={[
                    styles.pill,
                    { backgroundColor: colors.surface, borderColor: colors.holo },
                  ]}>
                  <ThemedText variant="figureSmall">+{tally} added</ThemedText>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Torch"
                accessibilityState={{ checked: torch }}
                onPress={() => setTorch((t) => !t)}
                style={[
                  styles.round,
                  {
                    backgroundColor: torch ? colors.accent : colors.surface,
                    borderColor: torch ? colors.accent : colors.outline,
                  },
                ]}>
                <Icon
                  name={torch ? 'flashlight.on.fill' : 'flashlight.off.fill'}
                  size={18}
                  color={torch ? 'onAccent' : 'text'}
                />
              </Pressable>
            </View>
            {state.step === 'camera' && guide ? (
              <ThemedText
                variant="label"
                style={[styles.hint, { top: guide.y - 34 - spacing.sm }]}
                accessibilityLiveRegion="polite">
                {online ? 'Fit the card inside the frame' : 'Offline: scanning needs a connection'}
              </ThemedText>
            ) : null}
          </SafeAreaView>

          {state.step === 'camera' ? (
            <View style={styles.bottom} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Take the photo"
                disabled={!ready || !online || capturing}
                onPress={shoot}
                style={({ pressed }) => [
                  styles.shutter,
                  {
                    borderColor: colors.text,
                    opacity: !ready || !online ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}>
                <View style={[styles.shutterInner, { backgroundColor: colors.accent }]} />
              </Pressable>
            </View>
          ) : null}

          {busy ? (
            <View style={styles.centre} pointerEvents="box-none">
              <ThemedView
                background="surface"
                style={[styles.status, { borderColor: colors.border }]}>
                <ActivityIndicator color={colors.accent} />
                <ThemedText variant="label" accessibilityLiveRegion="polite">
                  {state.step === 'uploading'
                    ? 'Sending the photo…'
                    : state.status === 'retrying'
                      ? 'The scanner is busy; trying again shortly…'
                      : 'Reading the card…'}
                </ThemedText>
                <Button title="Cancel" variant="secondary" onPress={() => flow.reset()} />
              </ThemedView>
            </View>
          ) : null}

          {state.step === 'results' || state.step === 'failed' ? (
            <ThemedView
              background="background"
              style={[styles.sheet, { borderColor: colors.border }]}>
              <View style={styles.sheetHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close and scan another card"
                  hitSlop={spacing.sm}
                  onPress={() => {
                    setSelected(null);
                    flow.reset();
                  }}
                  style={[styles.close, { backgroundColor: colors.surfaceRaised }]}>
                  <Icon name="xmark" size={14} color="textSecondary" weight="bold" />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.sheetContent} bounces={false}>
                {state.step === 'results' ? (
                  selected ? (
                    <ScanConfirm
                      match={selected}
                      busy={add.isPending}
                      disabled={!online}
                      onAdd={(choice) => confirm(selected, choice)}
                      onBack={() => setSelected(null)}
                    />
                  ) : (
                    <>
                      <ScanCandidates
                        candidates={state.candidates}
                        recognized={state.recognized}
                        onPick={setSelected}
                      />
                      <View style={styles.actions}>
                        {term ? (
                          <Button
                            title="None of these: search"
                            variant="secondary"
                            style={styles.action}
                            onPress={() => searchInstead(term)}
                          />
                        ) : null}
                        <Button
                          title="Retake"
                          variant="secondary"
                          style={styles.action}
                          onPress={() => flow.reset()}
                        />
                      </View>
                    </>
                  )
                ) : (
                  <>
                    <ThemedText variant="heading">
                      {state.jobId === null ? 'Couldn’t scan' : 'No match'}
                    </ThemedText>
                    <ThemedText color="textSecondary">{state.message}</ThemedText>
                    {state.canRetry ? (
                      <Button title="Try this photo again" onPress={flow.retry} />
                    ) : null}
                    {term ? (
                      <Button
                        title={`Search for “${term}”`}
                        variant="secondary"
                        onPress={() => searchInstead(term)}
                      />
                    ) : null}
                    <Button title="Retake" variant="secondary" onPress={() => flow.reset()} />
                  </>
                )}
              </ScrollView>
            </ThemedView>
          ) : null}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  pill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
  },
  round: {
    width: minTapTarget,
    height: minTapTarget,
    borderRadius: minTapTarget / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { position: 'absolute', left: 0, right: 0, textAlign: 'center', lineHeight: 34 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.lg,
    alignItems: 'center',
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29 },
  centre: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    minWidth: 240,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  sheetContent: { padding: spacing.md + 4, paddingTop: 0, gap: spacing.md },
  sheetHeader: { alignItems: 'flex-end', padding: spacing.sm },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
