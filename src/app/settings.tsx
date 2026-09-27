import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ConnectionForm } from '@/components/connection-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { clearQueryCache } from '@/session/query';
import { useActiveRoute, useSession } from '@/session/session';
import { spacing } from '@/theme';

export default function Settings() {
  const { session, signIn, signOut } = useSession();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { route, url } = useActiveRoute();
  if (session.status !== 'signedIn') return null;

  function confirmSignOut() {
    Alert.alert('Sign out?', 'This removes the server and account from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await clearQueryCache();
          await signOut();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.fill}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText variant="heading">Connection</ThemedText>
          <ThemedText>
            {route && url ? `Using the ${route} address, ${url}.` : 'Not connected yet.'}
          </ThemedText>
          {session.credentials.fallbackUrl ? (
            <Button
              title="Re-check which address to use"
              variant="secondary"
              onPress={async () => {
                session.client.invalidateRoute();
                await queryClient.invalidateQueries({ queryKey: ['me'] });
              }}
            />
          ) : null}
          <ThemedText color="textSecondary">Changes are tested before they are saved.</ThemedText>
          <ConnectionForm
            initial={session.credentials}
            submitTitle={saved ? 'Saved — test again' : 'Test and save'}
            onVerified={async (credentials) => {
              const accountChanged =
                credentials.primaryUrl !== session.credentials.primaryUrl ||
                credentials.username !== session.credentials.username;
              if (accountChanged) await clearQueryCache();
              await signIn(credentials);
              await queryClient.invalidateQueries();
              setSaved(true);
            }}
          />

          <ThemedText variant="heading">Data</ThemedText>
          <Button
            title="Clear cached data"
            variant="secondary"
            onPress={async () => {
              await clearQueryCache();
              Alert.alert('Cache cleared', 'Everything will be fetched fresh.');
            }}
          />
          <Button title="Sign out" variant="destructive" onPress={confirmSignOut} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
});
