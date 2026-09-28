import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import type { User } from '@/api/schemas';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMe } from '@/hooks/use-me';
import { clearQueryCache } from '@/session/query';
import { useActiveRoute, useSession } from '@/session/session';
import { spacing, useColors } from '@/theme';
import { pick } from '@/utils/pick';
import { showToast } from '@/utils/toast';

/**
 * Settings as an iOS grouped list: accounts first, the connection as one row
 * that opens its own screen, then data, and Sign out as a red row at the
 * bottom rather than the loudest thing on the screen (HIG Settings).
 */
export default function Settings() {
  const { session, signOut, switchAccount, removeAccount } = useSession();
  const queryClient = useQueryClient();
  const { route } = useActiveRoute();
  const me = useMe();
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
              showToast({
                kind: 'error',
                title: 'Could not remove the account',
                message: error instanceof Error ? error.message : String(error),
              });
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
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <Group title="Accounts">
          {accounts.map((account) => {
            const current = account.id === cacheId;
            const name = current ? (me.data?.username ?? account.username) : account.username;
            // Another account's avatar is known if it was used on this phone before.
            const avatarId = current
              ? me.data?.avatar_id
              : queryClient.getQueryData<User>([account.id, 'me'])?.avatar_id;
            return (
              <ListRow
                key={account.id}
                title={name}
                subtitle={current ? 'Current account' : 'Switch or remove'}
                accessibilityLabel={current ? `${name}, current account` : name}
                leading={<Avatar name={name} avatarId={avatarId} size={36} />}
                kind="action"
                onPress={
                  current && accounts.length === 1
                    ? undefined
                    : () => accountOptions(account.id, account.username)
                }
              />
            );
          })}
          <ListRow
            title="Add an account"
            leading={<Icon name="plus.circle" size={22} color="accent" />}
            onPress={() => router.push('/add-account')}
          />
        </Group>

        <Group title="Connection">
          <ListRow
            title="Server and login"
            subtitle={
              route ? `Using the ${route === 'primary' ? 'primary' : 'fallback'} address` : undefined
            }
            onPress={() => router.push('/connection')}
          />
        </Group>

        <Group title="Data">
          <ListRow
            title="Clear cached data"
            subtitle="Everything is fetched again"
            kind="action"
            onPress={async () => {
              await clearQueryCache();
              showToast({
                kind: 'success',
                title: 'Cache cleared',
                message: 'Everything will be fetched fresh.',
              });
            }}
          />
        </Group>

        <Group>
          <ListRow title="Sign out" kind="destructive" onPress={confirmSignOut} />
        </Group>
      </ScrollView>
    </ThemedView>
  );
}

/** A section of the grouped list: a heading, then rows edge to edge. */
function Group({ title, children }: { title?: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.group}>
      {title ? (
        <ThemedText variant="heading" style={styles.groupTitle}>
          {title}
        </ThemedText>
      ) : null}
      <View style={[styles.rows, { borderColor: colors.border }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingVertical: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.sm },
  groupTitle: { paddingHorizontal: spacing.md },
  rows: { borderTopWidth: StyleSheet.hairlineWidth },
});
