import { router } from 'expo-router';

import { AccessError, AuthError } from '@/api/errors';
import { Button } from '@/components/button';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';
import { useMe } from '@/hooks/use-me';

export default function Home() {
  const me = useMe();

  if (me.data) {
    return (
      <PlaceholderScreen
        title={`Hi, ${me.data.username}`}
        description="Connected through Cloudflare Access. The collection overview arrives in phase 2."
      />
    );
  }

  if (me.error) {
    const needsSettings = me.error instanceof AccessError || me.error instanceof AuthError;
    return (
      <PlaceholderScreen title="Not connected" description={me.error.message}>
        {needsSettings ? (
          <Button title="Open Settings" onPress={() => router.push('/settings')} />
        ) : (
          <Button title="Try again" variant="secondary" onPress={() => me.refetch()} />
        )}
      </PlaceholderScreen>
    );
  }

  return (
    <PlaceholderScreen title="Home" description="">
      <ThemedText color="textSecondary">Connecting…</ThemedText>
    </PlaceholderScreen>
  );
}
