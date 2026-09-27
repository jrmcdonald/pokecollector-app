/**
 * Two builds of the same app, side by side on one phone:
 *
 *   APP_VARIANT=development  "PokeCollector Dev" — the dev client, which loads
 *                            JavaScript from Metro on the PC
 *   APP_VARIANT=production   "PokeCollector" — the JavaScript bundled in
 *
 * They need different bundle IDs to coexist. Together with AltStore they are
 * the three apps a free Apple ID allows. Don't change these IDs casually: each
 * new one uses one of the ten App IDs a free account may register a week.
 *
 * Nothing secret belongs here. This file is committed and ends up in the
 * app bundle; the server and credentials are entered on the phone.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

type Variant = 'development' | 'production';

function variant(): Variant {
  const value = process.env.APP_VARIANT ?? 'development';
  if (value !== 'development' && value !== 'production') {
    throw new Error(`APP_VARIANT must be development or production, not ${value}`);
  }
  return value;
}

const VARIANTS = {
  development: {
    name: 'PokeCollector Dev',
    bundleIdentifier: 'io.github.jrmcdonald.pokecollector.dev',
    scheme: 'pokecollector-dev',
  },
  production: {
    name: 'PokeCollector',
    bundleIdentifier: 'io.github.jrmcdonald.pokecollector',
    scheme: 'pokecollector',
  },
} as const;

export default ({ config }: ConfigContext): ExpoConfig => {
  const v = VARIANTS[variant()];
  return {
    ...config,
    name: v.name,
    slug: 'pokecollector',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: v.scheme,
    userInterfaceStyle: 'automatic',
    platforms: ['ios'],
    ios: {
      bundleIdentifier: v.bundleIdentifier,
      supportsTablet: false,
      icon: './assets/expo.icon',
      infoPlist: {
        // Sideloaded, never submitted, but this stops Xcode asking.
        ITSAppUsesNonExemptEncryption: false,
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
      [
        'expo-camera',
        {
          cameraPermission: 'PokeCollector uses the camera to scan cards into your collection.',
          microphonePermission: false,
          recordAudioAndroid: false,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
