/**
 * Auto-capture on the Scan tab: a frame output that looks for a card in the
 * guide on the camera's own thread, and calls `onCapture` once one has held
 * still for about half a second. See `utils/card-detect.ts` for how.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CommonResolutions,
  useFrameOutput,
  type CameraFrameOutput,
  type Frame,
} from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';

import {
  AUTO_START,
  findCardEdges,
  guideInFrame,
  stepAuto,
  type AutoStatus,
} from '@/utils/card-detect';
import type { CameraFrame } from '@/utils/crop';

/** Checked about ten times a second; more would only cost battery. */
const INTERVAL_MS = 90;

export function useAutoCapture({
  on,
  ready,
  frame: layout,
  onCapture,
}: {
  /** The switch. */
  on: boolean;
  /** The camera is idle and a photo could be taken now. */
  ready: boolean;
  /** The camera view and its guide, once laid out. */
  frame: CameraFrame | null;
  onCapture(): void;
}): { output: CameraFrameOutput; status: AutoStatus } {
  const enabled = on && ready;
  const [status, setStatus] = useState<AutoStatus>('searching');
  const state = useRef(AUTO_START);
  const lastAt = useRef(0);
  const capture = useRef(onCapture);
  const live = useRef(enabled);
  useEffect(() => {
    capture.current = onCapture;
    live.current = enabled;
  });

  // Switched on, a card already in the guide is taken. Back from a photo, the
  // card just photographed has to be taken away first.
  // The status follows with the next frame, a tenth of a second later.
  useEffect(() => {
    state.current = AUTO_START;
  }, [on]);
  useEffect(() => {
    if (!ready) state.current = { ...AUTO_START, armed: false };
  }, [ready]);

  const report = useCallback((edges: number[]) => {
    if (!live.current) return;
    const now = Date.now();
    if (now - lastAt.current < INTERVAL_MS) return;
    lastAt.current = now;
    const step = stepAuto(state.current, edges);
    state.current = step.state;
    setStatus(step.status);
    if (step.fire) capture.current();
  }, []);

  // The camera's frames below are a different thing: pixels, not layout.
  const view = layout?.view;
  const guide = layout?.guide;
  const onFrame = useMemo(
    () =>
      guide && view
        ? (frame: Frame) => {
            'worklet';
            try {
              if (!frame.isPlanar) return;
              const luma = frame.getPlanes()[0];
              if (!luma) return;
              const size = { width: luma.width, height: luma.height };
              const edges = findCardEdges(
                new Uint8Array(luma.getPixelBuffer()),
                luma.bytesPerRow,
                size.width,
                size.height,
                guideInFrame(size, view, guide),
              );
              scheduleOnRN(report, edges);
            } finally {
              frame.dispose();
            }
          }
        : undefined,
    [guide, view, report],
  );

  const output = useFrameOutput({
    // Small is plenty for finding four edges, and cheap.
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'yuv',
    dropFramesWhileBusy: true,
    onFrame,
    onFrameDropped: () => undefined,
  });

  return { output, status };
}
