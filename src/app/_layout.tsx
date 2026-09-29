import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { QueryProvider } from '@/session/query';
import { ToastHost } from '@/components/toast-host';
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
    <GestureHandlerRootView style={styles.fill}>
      <ThemeProvider value={navigationTheme}>
        <SessionProvider>
          <QueryProvider>
            <RootStack />
            <ToastHost />
          </QueryProvider>
        </SessionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
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
        // What VoiceOver reads for that chevron; otherwise it is the previous
        // route's name, which for a tab is "(tabs)".
        headerBackTitle: 'Back',
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
        <Stack.Screen name="wishlist" options={{ title: 'Wishlist' }} />
        <Stack.Screen name="sets" options={{ title: 'Sets' }} />
        <Stack.Screen name="set/[id]" options={{ title: '' }} />
        <Stack.Screen name="binder/[id]" options={{ title: '' }} />
        <Stack.Screen name="decks" options={{ title: 'Decks' }} />
        <Stack.Screen name="deck/[id]" options={{ title: '' }} />
        {/* A push, not a modal: a card opened from the review would otherwise be
            presented as a sheet of its own, with no back button. */}
        <Stack.Screen name="deck-import" options={{ title: 'Add a prebuilt deck' }} />
        <Stack.Screen name="scans/index" options={{ title: 'Scans to review' }} />
        <Stack.Screen name="scans/[id]" options={{ title: 'Review scans' }} />
        <Stack.Screen name="add-account" options={{ title: 'Add an account' }} />
        <Stack.Screen name="connection" options={{ title: 'Server and login' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
