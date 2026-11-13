/**
 * The holo shimmer over a card's picture on its page: a band of light that
 * moves, and a card that leans a few degrees, as the phone tilts. Upstream
 * 1.56.0's "Advanced Holo effects", drawn natively (see DECISIONS.md, "Holo
 * shimmer"); nothing of upstream's CSS, masks or textures is used.
 *
 * Built to cost little:
 * - The gravity sensor runs only while the effect is showing: the setting
 *   is on, Reduce Motion is off, the screen is focused and the app is in
 *   the foreground. Otherwise it is unregistered.
 * - Each reading moves the layers on the UI thread (Reanimated); React does
 *   not render per frame, and the SVG layers are drawn once and only moved,
 *   so every frame is a GPU transform and an opacity.
 * - The gradients are drawn at a quarter of their size (stripes at half)
 *   and scaled up, which keeps their bitmaps small; nobody sees the
 *   difference in a soft band of light.
 */
import { useIsFocused } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AppState,
  StyleSheet,
  type AppStateStatus,
  View,
  type BlendMode,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { LEVEL, nextTilt, type HoloStyle, type TiltState } from '@/utils/holo';

type Props = {
  /** The look, from `holoStyleFor`; null for a card that gets none. */
  look: HoloStyle | null;
  /** The account's holo setting. */
  enabled: boolean;
  /** Size and placement of the card. */
  style?: StyleProp<ViewStyle>;
  /** The corner radius of the picture, so the shimmer stays inside it. */
  borderRadius: number;
  /** The card's picture. */
  children: ReactNode;
};

/** The picture, with the shimmer over it when it should show. */
export function HoloArt({ look, enabled, style, borderRadius, children }: Props) {
  const active = useHoloActive(look !== null && enabled);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  // The card leans with the light, at most 6° each way.
  const lean = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateX: `${-y.value * 6}deg` },
      { rotateY: `${x.value * 6}deg` },
    ],
  }));

  return (
    <Animated.View
      testID="holo-art"
      style={[style, lean]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size?.width || height !== size?.height) setSize({ width, height });
      }}>
      {children}
      {active && look && size ? (
        <>
          <TiltSensor x={x} y={y} />
          <Shimmer
            look={look}
            x={x}
            y={y}
            width={size.width}
            height={size.height}
            radius={borderRadius}
          />
        </>
      ) : null}
    </Animated.View>
  );
}

/**
 * Whether the shimmer, and with it the sensor, should run: wanted, Reduce
 * Motion off (HIG Motion; WCAG 2.3.3), this screen focused and the app in
 * the foreground.
 */
export function useHoloActive(wanted: boolean): boolean {
  const reduceMotion = useReduceMotion();
  const focused = useIsFocused();
  const foreground = useForeground();
  return wanted && !reduceMotion && focused && foreground;
}

/**
 * Not in the background, nor `inactive` (Control Centre, the app switcher, a
 * call coming in). `unknown`, before iOS has said, counts as foreground.
 */
const inForeground = (state: AppStateStatus) => state !== 'background' && state !== 'inactive';

function useForeground(): boolean {
  const [foreground, setForeground] = useState(() => inForeground(AppState.currentState));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(inForeground(state)),
    );
    return () => subscription.remove();
  }, []);
  return foreground;
}

/**
 * The gravity sensor, while mounted. Reanimated registers it on mount and
 * unregisters it on unmount, so this is mounted only while the shimmer is
 * on. It needs no permission on iOS.
 */
function TiltSensor({ x, y }: { x: SharedValue<number>; y: SharedValue<number> }) {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 16 });
  const tilt = useSharedValue<TiltState>(LEVEL);
  useAnimatedReaction(
    () => gravity.sensor.value,
    (reading) => {
      // `set`, not `.value =`: the React Compiler treats an assignment to a
      // prop as a mutation.
      const next = nextTilt(tilt.get(), reading.x, reading.y);
      tilt.set(next);
      x.set(next.x);
      y.set(next.y);
    },
  );
  // Settle back to level when the sensor stops: the screen lost focus, or
  // the app went to the background.
  useEffect(
    () => () => {
      x.set(withTiming(0, { duration: 250 }));
      y.set(withTiming(0, { duration: 250 }));
    },
    [x, y],
  );
  return null;
}

type Look = {
  /** The band's colours across the layer, as [offset, colour, opacity]. */
  band: readonly (readonly [number, string, number])[];
  blend: BlendMode;
  /** Opacity level, and how much more at full tilt. */
  rest: number;
  gain: number;
  glitter: boolean;
  /** Fine stripes blur at a quarter size, so they are drawn at half. */
  fine?: boolean;
};

const clear = (offset: number) => [offset, '#FFFFFF', 0] as const;

/** Fine diagonal stripes over the whole layer, for a reverse holo. */
const STRIPES = Array.from({ length: 28 }, (_, i) => {
  const at = i / 28;
  return [
    [at, '#FFFFFF', 0],
    [at + 0.5 / 28, '#DDF4FF', 0.55],
  ] as const;
}).flat();

/** Opacities are of the layer; colours are decoration, so no contrast minimum. */
const LOOKS: Record<HoloStyle, Look> = {
  holo: {
    band: [
      clear(0.3),
      [0.42, '#4FC3E8', 0.35],
      [0.5, '#FFFFFF', 0.85],
      [0.58, '#F5C518', 0.3],
      clear(0.7),
    ],
    blend: 'screen',
    rest: 0.35,
    gain: 0.5,
    glitter: false,
  },
  reverse: { band: STRIPES, blend: 'screen', rest: 0.18, gain: 0.32, glitter: false, fine: true },
  sparkle: {
    band: [
      clear(0.28),
      [0.4, '#7FD8FF', 0.4],
      [0.5, '#FFFFFF', 0.8],
      [0.6, '#C9A8FF', 0.4],
      clear(0.72),
    ],
    blend: 'screen',
    rest: 0.35,
    gain: 0.5,
    glitter: true,
  },
  rainbow: {
    band: [
      clear(0.18),
      [0.27, '#FF4D6D', 0.85],
      [0.36, '#FFB13B', 0.85],
      [0.45, '#F5E663', 0.85],
      [0.54, '#5CF2A0', 0.85],
      [0.63, '#4FC3E8', 0.85],
      [0.72, '#7B7BFF', 0.85],
      [0.8, '#E07BFF', 0.85],
      clear(0.88),
    ],
    blend: 'soft-light',
    rest: 0.5,
    gain: 0.5,
    glitter: false,
  },
  gold: {
    band: [
      clear(0.3),
      [0.4, '#E0A526', 0.65],
      [0.5, '#FFF3C4', 0.9],
      [0.6, '#FFC94A', 0.65],
      clear(0.7),
    ],
    blend: 'screen',
    rest: 0.35,
    gain: 0.5,
    glitter: true,
  },
};

/** How much bigger than the card the band's layer is, so it can travel. */
const SPAN = 2;
/** The band is drawn this many times smaller than it shows. */
const SOFT = 4;

function Shimmer({
  look,
  x,
  y,
  width,
  height,
  radius,
}: {
  look: HoloStyle;
  x: SharedValue<number>;
  y: SharedValue<number>;
  width: number;
  height: number;
  radius: number;
}) {
  const spec = LOOKS[look];
  const scale = spec.fine ? 2 : SOFT;

  // Tilting right sends the light left, as a lamp above the phone would.
  const travel = useAnimatedStyle(() => ({
    opacity: spec.rest + spec.gain * Math.min(1, Math.hypot(x.value, y.value)),
    transform: [{ translateX: -x.value * width * 0.5 }, { translateY: -y.value * height * 0.5 }],
  }));
  // Glitter moves less than the light, against it, and twinkles with the tilt.
  const parallax = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.7 * Math.min(1, Math.hypot(x.value, y.value) * 1.5),
    transform: [{ translateX: x.value * width * 0.05 }, { translateY: y.value * height * 0.05 }],
  }));

  const layerWidth = (width * SPAN) / scale;
  const layerHeight = (height * SPAN) / scale;
  return (
    <View
      testID="holo-shimmer"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        styles.clip,
        { borderRadius: radius, mixBlendMode: spec.blend },
      ]}>
      <Animated.View style={[StyleSheet.absoluteFill, travel]}>
        <View
          style={{
            position: 'absolute',
            width: layerWidth,
            height: layerHeight,
            left: (width - layerWidth) / 2,
            top: (height - layerHeight) / 2,
            transform: [{ scale }],
          }}>
          <Svg width={layerWidth} height={layerHeight}>
            <Defs>
              <LinearGradient id="band" x1="0" y1="0" x2="1" y2="1">
                {spec.band.map(([offset, color, opacity], i) => (
                  <Stop key={i} offset={offset} stopColor={color} stopOpacity={opacity} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect width={layerWidth} height={layerHeight} fill="url(#band)" />
          </Svg>
        </View>
      </Animated.View>
      {spec.glitter ? (
        <Animated.View style={[styles.glitter, parallax]}>
          <Svg width={width * 1.2} height={height * 1.2}>
            {GLITTER.map(([gx, gy, r, o], i) => (
              <Circle
                key={i}
                cx={gx * width * 1.2}
                cy={gy * height * 1.2}
                r={r}
                fill="#FFFFFF"
                fillOpacity={o}
              />
            ))}
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * Glitter: x, y (shares of the layer), radius in points and opacity, from a
 * fixed seed so every card's page looks the same each time.
 */
const GLITTER = (() => {
  let seed = 0x2f6b;
  const random = () => {
    // A 16-bit linear congruential generator: plenty for scattering dots.
    seed = (seed * 25173 + 13849) % 65536;
    return seed / 65536;
  };
  return Array.from(
    { length: 70 },
    () => [random(), random(), 0.5 + random() * 1.1, 0.35 + random() * 0.6] as const,
  );
})();

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  glitter: { position: 'absolute', left: '-10%', top: '-10%' },
});
