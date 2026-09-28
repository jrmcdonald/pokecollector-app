import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

import { verifyConnection } from '@/api/verify';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { createClient, useSession } from '@/session/session';
import { spacing, useColors } from '@/theme';

/**
 * Another PokeCollector login on the server already set up. Tested before
 * it is saved, like the connection form, and then made the active account.
 */
export default function AddAccount() {
  const { session, addAccount } = useSession();
  const colors = useColors();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (session.status !== 'signedIn') return null;
  const server = session.credentials;

  async function submit() {
    const login = { username: username.trim(), password };
    if (!login.username || !login.password) {
      setError('Enter the username and password.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await verifyConnection({ ...server, ...login }, createClient);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await addAccount(login, result.token ?? undefined);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.fill}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText color="textSecondary">
            Each PokeCollector account has its own collection, wishlist and binders. Add another one
            on this server and switch between them from Home.
          </ThemedText>
          <TextField
            label="Username"
            value={username}
            onChangeText={setUsername}
            textContentType="username"
            autoComplete="username"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
            onSubmitEditing={submit}
          />
          {error ? (
            <ThemedText style={{ color: colors.danger }} accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          ) : null}
          <Button title="Test and add" busy={busy} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
});
