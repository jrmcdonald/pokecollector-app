/**
 * Two builds of the same app, side by side on one phone:
 *
 *   APP_VARIANT=development  "PokeCollector Dev" — the dev client, which loads
 *                            JavaScript from Metro on the PC
 *   APP_VARIANT=production   "PokeCollector" — the JavaScript bundled in
 *
 * They need different bundle IDs to coexist. Together with SideStore (or
 * AltStore) they are the three apps a free Apple ID allows. Don't change
 * these IDs casually: each new one uses one of the ten App IDs a free account
 * may register a week.
 *
 * Nothing secret or personal belongs here: this repository is public. The
 * server addresses and credentials are entered on the phone. The bundle ID
 * prefix defaults to this repository's GitHub namespace; a fork sets
 * BUNDLE_ID_PREFIX (locally, or as an Actions variable of the same name).
 *
 * The version is package.json's, which release-please sets. The build number
 * is BUILD_NUMBER, which the iOS build sets to the commit count: SideStore
 * checks both against its source, and a new build needs a higher number.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

import { version } from './package.json';

type Variant = 'development' | 'production';

const CAMERA_USAGE = 'PokeCollector uses the camera to scan cards into your collection.';

function variant(): Variant {
  const value = process.env.APP_VARIANT ?? 'development';
  if (value !== 'development' && value !== 'production') {
    throw new Error(`APP_VARIANT must be development or production, not ${value}`);
  }
  return value;
}

function buildNumber(): string {
  const value = process.env.BUILD_NUMBER?.trim() || '1';
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`BUILD_NUMBER must be a positive whole number, not ${value}`);
  }
  return value;
}

function bundleIdPrefix(): string {
  const value = process.env.BUNDLE_ID_PREFIX?.trim() || 'io.github.jrmcdonald';
  if (!/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/.test(value)) {
    throw new Error(`BUNDLE_ID_PREFIX must be reverse-DNS, like com.example, not ${value}`);
  }
  return value;
}

const VARIANTS = {
  development: {
    name: 'PokeCollector Dev',
    suffix: 'pokecollector.dev',
    scheme: 'pokecollector-dev',
  },
  production: { name: 'PokeCollector', suffix: 'pokecollector', scheme: 'pokecollector' },
} as const;

export default ({ config }: ConfigContext): ExpoConfig => {
  const v = VARIANTS[variant()];
  return {
    ...config,
    name: v.name,
    slug: 'pokecollector',
    version,
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: v.scheme,
    userInterfaceStyle: 'automatic',
    platforms: ['ios'],
    ios: {
      bundleIdentifier: `${bundleIdPrefix()}.${v.suffix}`,
      buildNumber: buildNumber(),
      supportsTablet: false,
      icon: './assets/expo.icon',
      infoPlist: {
        // Sideloaded, never submitted, but this stops Xcode asking.
        ITSAppUsesNonExemptEncryption: false,
        // react-native-vision-camera has no config plugin to set this.
        NSCameraUsageDescription: CAMERA_USAGE,
      },
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#D62F2F',
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
      // No biometrics: the Keychain item is protected by the device passcode.
      ['expo-secure-store', { faceIDPermission: false }],
      // Only the library picker is used. iOS's picker needs no access to the
      // library, but the string is there should iOS ever ask. The camera
      // string is repeated so the plugin's default does not replace it, and
      // `false` leaves out the microphone.
      [
        'expo-image-picker',
        {
          photosPermission: 'PokeCollector reads the photos you choose, to scan the cards in them.',
          cameraPermission: CAMERA_USAGE,
          microphonePermission: false,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
