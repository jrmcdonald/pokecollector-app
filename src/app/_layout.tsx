import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { QueryProvider } from '@/session/query';
import { SessionProvider, useSession } from '@/session/session';
import { fonts, forceDarkAppearance, useColors } from '@/theme';
import { useAppFonts } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync();
forceDarkAppearance();

export default function RootLayout() {
  const colors = useColors();
  const navigationTheme: Theme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };
  return (
    <ThemeProvider value={navigationTheme}>
      <SessionProvider>
        <QueryProvider>
          <RootStack />
        </QueryProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

function RootStack() {
  const { session } = useSession();
  const colors = useColors();
  const fontsReady = useAppFonts();
  const ready = session.status !== 'loading' && fontsReady;
  const signedIn = session.status === 'signedIn';

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Hold the splash screen until the Keychain has been read, so a signed-in
  // user never sees onboarding flash past, and until the fonts are in.
  if (!ready) return null;

  return (
    <Stack
      screenOptions={{
        // The back button otherwise shows the previous route's name, and the
        // tabs route is called "(tabs)". A chevron alone is the iOS norm.
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.semibold },
        headerLargeTitleStyle: { fontFamily: fonts.bold },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="collection" options={{ title: 'Collection' }} />
        <Stack.Screen name="card/[id]" options={{ title: '' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
