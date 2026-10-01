import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

import { sameAccount } from '@/auth/credentials';
import { Button } from '@/components/button';
import { ConnectionForm } from '@/components/connection-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { clearQueryCache } from '@/session/query';
import { useActiveRoute, useSession } from '@/session/session';
import { radius, spacing, useColors } from '@/theme';

/**
 * The server's addresses and proxy, and the current account's login:
 * set up once and rarely changed, so kept off the main Settings screen.
 */
export default function Connection() {
  const { session, signIn } = useSession();
  const queryClient = useQueryClient();
  const colors = useColors();
  const [saved, setSaved] = useState(false);
  const { route, url } = useActiveRoute();
  if (session.status !== 'signedIn') return null;
  const { accounts, cacheId } = session;

  return (
    <ThemedView style={styles.fill}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled">
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
          <ThemedText color="textSecondary">
            {accounts.length > 1
              ? 'The addresses and what is in front of the server apply to every account; the username and password are the current account’s. Changes are tested before they are saved.'
              : 'Changes are tested before they are saved.'}
          </ThemedText>
          <ConnectionForm
            initial={session.credentials}
            submitTitle={saved ? 'Saved — test again' : 'Test and save'}
            onVerified={async (credentials, _user, token) => {
              // Data for accounts that are no longer saved has no business
              // staying on disk. A new server replaces every account; a new
              // username replaces the current one, unless it is already saved,
              // in which case this is a switch.
              if (credentials.primaryUrl !== session.credentials.primaryUrl) {
                await clearQueryCache();
              } else if (
                !sameAccount(credentials, session.credentials) &&
                !accounts.some((a) => a.username === credentials.username)
              ) {
                queryClient.removeQueries({ queryKey: [cacheId] });
              }
              await signIn(credentials, token ?? undefined);
              // Safe straight after signIn: queries read the client through
              // getClient, so these refetch with the new credentials.
              await queryClient.invalidateQueries();
              setSaved(true);
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  panel: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
});
