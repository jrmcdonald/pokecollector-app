import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';

import { MAX_BATCH_PHOTOS } from '@/api/batch';
import { searchTermFor } from '@/api/scan';
import type { ScanMatch } from '@/api/schemas';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { TrayButton, TraySheet, type TrayPhoto } from '@/components/scan/batch-tray';
import { GuideOverlay } from '@/components/scan/guide-overlay';
import { ReviewEntry } from '@/components/scan/review-entry';
import { ScanCandidates } from '@/components/scan/scan-candidates';
import { ScanConfirm, type ScanChoice } from '@/components/scan/scan-confirm';
import { Segmented } from '@/components/segmented';
import { EmptyState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAddFromScan, useIsOnline, useScanJobs, useStartBatch } from '@/hooks/queries';
import { useAutoCapture } from '@/hooks/use-auto-capture';
import { useScanFlow } from '@/hooks/use-scan-flow';
import { minTapTarget, radius, spacing, useColors } from '@/theme';
import type { AutoStatus } from '@/utils/card-detect';
import { guideRect, type Size } from '@/utils/crop';
import { photosFromLibrary } from '@/utils/library';
import { prepareScanPhoto } from '@/utils/scan-photo';
import { showToast } from '@/utils/toast';

type Mode = 'single' | 'batch';

const MODES = [
  { value: 'single', label: 'One card' },
  { value: 'batch', label: 'Batch' },
] as const;

/**
 * Scan a card: fit it in the guide, take the photo, pick the right match,
 * confirm, and the camera is ready for the next card. A running tally counts
 * what this visit has added.
 *
 * Or a batch: photograph a stack of cards, one photo each, or choose photos
 * from the library, then send them all as one job and review them together
 * (`/scans/[id]`). Batches not finished wait in the scan inbox, which this
 * tab links to.
 *
 * With Auto on, the photo takes itself once a card has sat still in the
 * guide for half a second (`useAutoCapture`).
 */
export default function Scan() {
  const permission = useCameraPermission();
  const device = useCameraDevice('back');

  if (!permission.hasPermission) {
    return (
      <NoCamera
        title="Camera access"
        message="Scanning takes a photo of a card and sends it to your PokeCollector server to recognize. Nothing else is recorded."
        action={
          permission.canRequestPermission
            ? { title: 'Allow the camera', onPress: () => permission.requestPermission() }
            : { title: 'Open Settings', onPress: () => Linking.openSettings() }
        }
      />
    );
  }
  if (!device) {
    return (
      <NoCamera
        title="No camera"
        message="This device has no back camera to scan with. Photos from the library can still be scanned."
      />
    );
  }
  return <Scanner />;
}

/**
 * In place of the camera: why, and what works without it. Photos from the
 * library need no camera, and nor does reviewing scans already sent.
 */
function NoCamera({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: { title: string; onPress(): void };
}) {
  const focused = useIsFocused();
  const online = useIsOnline();
  const jobs = useScanJobs({ subscribed: focused });
  const startBatch = useStartBatch();
  const [picking, setPicking] = useState(false);

  async function scanFromLibrary() {
    setPicking(true);
    try {
      const { files, failed } = await photosFromLibrary(MAX_BATCH_PHOTOS);
      if (failed > 0) showToast({ kind: 'error', title: couldNotRead(failed) });
      if (files.length === 0) return;
      startBatch.mutate(files, {
        onSuccess: (job) =>
          router.push({ pathname: '/scans/[id]', params: { id: String(job.id) } }),
      });
    } finally {
      setPicking(false);
    }
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <EmptyState title={title} message={message} action={action} />
        <View style={styles.inbox}>
          <Button
            title="Scan photos from your library"
            variant="secondary"
            busy={picking || startBatch.isPending}
            disabled={!online}
            onPress={scanFromLibrary}
          />
          <ReviewEntry jobs={jobs.data} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function Scanner() {
  const colors = useColors();
  const focused = useIsFocused();
  const online = useIsOnline();
  const flow = useScanFlow();
  const add = useAddFromScan();
  const jobs = useScanJobs({ subscribed: focused });
  const startBatch = useStartBatch();
  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput({
    containerFormat: 'jpeg',
    qualityPrioritization: 'balanced',
  });
  const [view, setView] = useState<Size | null>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [auto, setAuto] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [tally, setTally] = useState(0);
  const [selected, setSelected] = useState<ScanMatch | null>(null);
  const [mode, setMode] = useState<Mode>('single');
  const [tray, setTray] = useState<TrayPhoto[]>([]);
  const [trayOpen, setTrayOpen] = useState(false);
  const { state } = flow;
  const guide = view ? guideRect(view) : null;
  const batch = mode === 'batch';
  const trayFull = tray.length >= MAX_BATCH_PHOTOS;
  // A batch photo stays on the phone, so batch mode works offline until "Scan".
  const canShoot =
    ready && !capturing && !picking && (batch ? !trayFull && !startBatch.isPending : online);
  const autoCapture = useAutoCapture({
    on: auto,
    ready: canShoot && state.step === 'camera' && !trayOpen && focused,
    view,
    onCapture: () => shoot(),
  });
  const outputs = auto ? [photoOutput, autoCapture.output] : [photoOutput];

  async function shoot() {
    if (!view || !canShoot) return;
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    let uri: string;
    try {
      const photo = await photoOutput.capturePhotoToFile(
        { flashMode: 'off', enableShutterSound: false },
        {},
      );
      uri = `file://${photo.filePath}`;
    } catch {
      setCapturing(false);
      showToast({ kind: 'error', title: 'Couldn’t take the photo', message: 'Try again.' });
      return;
    }
    try {
      if (batch) await keepForBatch(uri, view);
      else await flow.capture(uri, view);
    } finally {
      setCapturing(false);
    }
  }

  /** Crops the photo as a single scan would, and puts it in the tray. */
  async function keepForBatch(uri: string, size: Size) {
    try {
      const file = await prepareScanPhoto(uri, size);
      setTray((photos) => [...photos, { key: file.uri, uri: file.uri }]);
    } catch {
      showToast({ kind: 'error', title: 'Couldn’t keep that photo', message: 'Take it again.' });
    } finally {
      deleteQuietly(uri);
    }
  }

  /** Photos from the library into the tray, as many as it has room for. */
  async function addFromLibrary() {
    if (picking || trayFull) return;
    setPicking(true);
    try {
      const { files, failed } = await photosFromLibrary(MAX_BATCH_PHOTOS - tray.length);
      if (failed > 0) showToast({ kind: 'error', title: couldNotRead(failed) });
      const added = files.map((file) => ({ key: file.uri, uri: file.uri }));
      setTray((photos) => [...photos, ...added].slice(0, MAX_BATCH_PHOTOS));
    } finally {
      setPicking(false);
    }
  }

  function removeFromTray(photo: TrayPhoto) {
    deleteQuietly(photo.uri);
    setTray((photos) => photos.filter((p) => p.key !== photo.key));
  }

  function clearTray() {
    for (const photo of tray) deleteQuietly(photo.uri);
    setTray([]);
    setTrayOpen(false);
  }

  function sendBatch() {
    if (tray.length === 0 || startBatch.isPending) return;
    setTrayOpen(false);
    startBatch.mutate(
      tray.map((photo) => new File(photo.uri)),
      {
        onSuccess: (job) => {
          // The photos have moved to the job's folder; the tray is empty.
          setTray([]);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => undefined,
          );
          router.push({ pathname: '/scans/[id]', params: { id: String(job.id) } });
        },
      },
    );
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
          {device ? (
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={focused}
              outputs={outputs}
              resizeMode="cover"
              torchMode={torch && focused ? 'on' : 'off'}
              onStarted={() => setReady(true)}
              onStopped={() => setReady(false)}
              onError={() => setReady(false)}
            />
          ) : null}
          {guide && view ? (
            <GuideOverlay
              view={view}
              guide={guide}
              active={state.step === 'camera'}
              found={auto && autoCapture.status === 'holding'}
            />
          ) : null}

          <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
            <View style={styles.topRow} pointerEvents="box-none">
              {state.step === 'camera' ? (
                <View style={styles.mode}>
                  <Segmented<Mode>
                    label="Scan mode"
                    options={MODES}
                    value={mode}
                    onChange={setMode}
                  />
                </View>
              ) : (
                <View />
              )}
              <View style={styles.toggles}>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel="Auto-capture"
                  accessibilityHint="Takes the photo once a card sits still in the frame"
                  accessibilityState={{ checked: auto }}
                  onPress={() => setAuto((a) => !a)}
                  style={[
                    styles.round,
                    {
                      backgroundColor: auto ? colors.accent : colors.surface,
                      borderColor: auto ? colors.accent : colors.outline,
                    },
                  ]}>
                  <Icon name="viewfinder" size={20} color={auto ? 'onAccent' : 'text'} />
                </Pressable>
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
            </View>
            {state.step === 'camera' && guide ? (
              <ThemedText
                variant="label"
                style={[styles.hint, { top: guide.y - 34 - spacing.sm }]}
                accessibilityLiveRegion="polite">
                {hintFor(mode, online, trayFull, auto ? autoCapture.status : null)}
              </ThemedText>
            ) : null}
          </SafeAreaView>

          {state.step === 'camera' ? (
            <View style={styles.bottom} pointerEvents="box-none">
              <View style={styles.side}>
                {batch && tray.length > 0 ? (
                  <TrayButton photos={tray} onPress={() => setTrayOpen(true)} />
                ) : batch ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose photos from your library"
                    disabled={picking}
                    onPress={addFromLibrary}
                    style={[
                      styles.round,
                      { backgroundColor: colors.surface, borderColor: colors.outline },
                    ]}>
                    {picking ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <Icon name="photo.on.rectangle" size={20} color="text" />
                    )}
                  </Pressable>
                ) : tally > 0 ? (
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
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={batch ? 'Take a photo for the batch' : 'Take the photo'}
                disabled={!canShoot}
                onPress={shoot}
                style={({ pressed }) => [
                  styles.shutter,
                  {
                    borderColor: colors.text,
                    opacity: !canShoot && !capturing ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}>
                <View style={[styles.shutterInner, { backgroundColor: colors.accent }]} />
              </Pressable>
              <View style={[styles.side, styles.sideEnd]}>
                {batch && tray.length > 0 ? (
                  <Button
                    title={`Scan ${tray.length}`}
                    busy={startBatch.isPending}
                    disabled={!online}
                    onPress={sendBatch}
                  />
                ) : (
                  <ReviewEntry jobs={jobs.data} />
                )}
              </View>
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
      <TraySheet
        visible={trayOpen}
        photos={tray}
        sending={startBatch.isPending}
        canSend={online}
        adding={picking}
        onAdd={addFromLibrary}
        onRemove={removeFromTray}
        onClear={clearTray}
        onSend={sendBatch}
        onClose={() => setTrayOpen(false)}
      />
    </ThemedView>
  );
}

function hintFor(mode: Mode, online: boolean, trayFull: boolean, auto: AutoStatus | null): string {
  if (auto === 'holding' && (mode === 'batch' ? !trayFull : online)) return 'Hold still…';
  if (auto === 'remove' && mode === 'batch' && !trayFull) return 'Got it. Next card';
  if (mode === 'single') {
    return online ? 'Fit the card inside the frame' : 'Offline: scanning needs a connection';
  }
  if (trayFull) return `${MAX_BATCH_PHOTOS} photos is the most in one batch`;
  return online ? 'One card per photo' : 'Offline: photos wait here until you’re connected';
}

function couldNotRead(n: number): string {
  return n === 1 ? 'One photo couldn’t be read' : `${n} photos couldn’t be read`;
}

function deleteQuietly(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // Best effort: iOS clears the cache directory itself.
  }
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
  mode: { width: 208 },
  toggles: { flexDirection: 'row', gap: spacing.sm },
  inbox: { alignItems: 'center', padding: spacing.md },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  sideEnd: { justifyContent: 'flex-end' },
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
