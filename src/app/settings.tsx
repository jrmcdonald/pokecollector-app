import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ConnectionForm } from '@/components/connection-form';
import { ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { sameAccount } from '@/auth/credentials';
import { useMe } from '@/hooks/use-me';
import { clearQueryCache } from '@/session/query';
import { useActiveRoute, useSession } from '@/session/session';
import { radius, spacing, useColors } from '@/theme';
import { pick } from '@/utils/pick';

export default function Settings() {
  const { session, signIn, signOut, switchAccount, removeAccount } = useSession();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { route, url } = useActiveRoute();
  const me = useMe();
  const colors = useColors();
  if (session.status !== 'signedIn') return null;

  const { accounts, cacheId } = session;

  async function accountOptions(id: string, username: string) {
    const current = id === cacheId;
    const options = [
      ...(current ? [] : [`Switch to ${username}`]),
      ...(accounts.length > 1 ? [`Remove ${username}`] : []),
    ];
    if (options.length === 0) return;
    const index = await pick(username, options);
    if (index === null) return;
    if (options[index]?.startsWith('Switch')) {
      await switchAccount(id);
      return;
    }
    Alert.alert(
      `Remove ${username}?`,
      'Their login and cached data leave this phone. Nothing changes on the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeAccount(id);
              // Only this account's queries: every key starts with its id.
              queryClient.removeQueries({ queryKey: [id] });
            } catch (error) {
              Alert.alert(
                'Could not remove it',
                error instanceof Error ? error.message : String(error),
              );
            }
          },
        },
      ],
    );
  }

  function confirmSignOut() {
    Alert.alert(
      'Sign out?',
      accounts.length > 1
        ? `This removes the server and all ${accounts.length} accounts from this phone.`
        : 'This removes the server and account from this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await clearQueryCache();
            await signOut();
          },
        },
      ],
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText variant="heading">Accounts</ThemedText>
          <View style={[styles.accounts, { borderColor: colors.border }]}>
            {accounts.map((account) => {
              const current = account.id === cacheId;
              const name = current ? (me.data?.username ?? account.username) : account.username;
              return (
                <ListRow
                  key={account.id}
                  title={name}
                  subtitle={current ? 'Current account' : 'Tap to switch or remove'}
                  accessibilityLabel={current ? `${name}, current account` : name}
                  leading={<Avatar name={name} size={36} />}
                  onPress={
                    current && accounts.length === 1
                      ? undefined
                      : () => accountOptions(account.id, account.username)
                  }
                />
              );
            })}
          </View>
          <Button
            title="Add an account"
            variant="secondary"
            onPress={() => router.push('/add-account')}
          />

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
          <ThemedText color="textSecondary">
            {accounts.length > 1
              ? 'The addresses and service token apply to every account; the username and password are the current account’s. Changes are tested before they are saved.'
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
  accounts: { borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: -spacing.lg },
  panel: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
});
