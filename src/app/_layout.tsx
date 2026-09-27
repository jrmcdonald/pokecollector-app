import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { QueryProvider } from '@/session/query';
import { SessionProvider, useSession } from '@/session/session';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
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
  const ready = session.status !== 'loading';
  const signedIn = session.status === 'signedIn';

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Hold the splash screen until the Keychain has been read, so a signed-in
  // user never sees onboarding flash past.
  if (!ready) return null;

  return (
    <Stack
      screenOptions={{
        // The back button otherwise shows the previous route's name, and the
        // tabs route is called "(tabs)". A chevron alone is the iOS norm.
        headerBackButtonDisplayMode: 'minimal',
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
