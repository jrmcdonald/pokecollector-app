import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ConnectionForm } from '@/components/connection-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { sameAccount } from '@/auth/credentials';
import { useMe } from '@/hooks/use-me';
import { clearQueryCache } from '@/session/query';
import { useActiveRoute, useSession } from '@/session/session';
import { radius, spacing, useColors } from '@/theme';

export default function Settings() {
  const { session, signIn, signOut } = useSession();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { route, url } = useActiveRoute();
  const me = useMe();
  const colors = useColors();
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
          <View style={styles.account}>
            <Avatar name={me.data?.username ?? session.credentials.username} size={48} />
            <View style={styles.accountText}>
              <ThemedText variant="heading" numberOfLines={1}>
                {me.data?.username ?? session.credentials.username}
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary">
                Signed in
              </ThemedText>
            </View>
          </View>

          <ThemedText variant="heading">Connection</ThemedText>
          <ThemedView
            background="surface"
            style={[styles.panel, { borderColor: colors.border }]}
            accessible
            accessibilityLabel={
              route && url ? `Using the ${route} address, ${url}` : 'Not connected yet'
            }>
            <ThemedText variant="overline" color="textSecondary">
              Address in use
            </ThemedText>
            {route && url ? (
              <>
                <ThemedText variant="label">
                  {route === 'primary' ? 'Primary' : 'Fallback'}
                </ThemedText>
                <ThemedText variant="figureSmall" color="textSecondary" numberOfLines={1}>
                  {url}
                </ThemedText>
              </>
            ) : (
              <ThemedText>Not connected yet.</ThemedText>
            )}
          </ThemedView>
          {session.credentials.fallbackUrl ? (
            <Button
              title="Re-check which address to use"
              variant="secondary"
              onPress={async () => {
                session.client.invalidateRoute();
                await queryClient.invalidateQueries({ queryKey: [session.cacheId] });
              }}
            />
          ) : null}
          <ThemedText color="textSecondary">Changes are tested before they are saved.</ThemedText>
          <ConnectionForm
            initial={session.credentials}
            submitTitle={saved ? 'Saved — test again' : 'Test and save'}
            onVerified={async (credentials, _user, token) => {
              // Another account's data has no business staying on disk.
              if (!sameAccount(credentials, session.credentials)) await clearQueryCache();
              await signIn(credentials, token ?? undefined);
              // Safe straight after signIn: queries read the client through
              // getClient, so these refetch with the new credentials.
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
  account: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  accountText: { flex: 1, gap: 2 },
  panel: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
});
