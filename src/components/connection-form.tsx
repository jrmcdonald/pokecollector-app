/**
 * The server, service token and account, with a connection test that must
 * pass before anything is saved. Used by onboarding and by Settings.
 */
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import type { ServerCredentials } from '@/api/client';
import type { User } from '@/api/schemas';
import { verifyConnection } from '@/api/verify';
import { normaliseCredentials, toInput, type CredentialsInput } from '@/auth/credentials';
import { createClient } from '@/session/session';
import { spacing } from '@/theme';

import { Button } from './button';
import { TextField } from './text-field';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const EMPTY: CredentialsInput = {
  primaryUrl: '',
  fallbackUrl: '',
  accessClientId: '',
  accessClientSecret: '',
  username: '',
  password: '',
};

type Props = {
  initial?: ServerCredentials;
  submitTitle: string;
  onVerified(credentials: ServerCredentials, user: User): Promise<void>;
};

export function ConnectionForm({ initial, submitTitle, onVerified }: Props) {
  const [values, setValues] = useState<CredentialsInput>(initial ? toInput(initial) : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  const set = (key: keyof CredentialsInput) => (text: string) =>
    setValues((current) => ({ ...current, [key]: text }));

  async function submit() {
    setError(null);
    const normalised = normaliseCredentials(values);
    if (!normalised.ok) {
      setError({ title: 'Check the details', message: normalised.error });
      return;
    }
    setBusy(true);
    try {
      const result = await verifyConnection(normalised.value, createClient);
      if (!result.ok) {
        const where = result.route ? ` (${result.route} address)` : '';
        setError({
          title:
            result.step === 'access'
              ? `Could not get through Cloudflare${where}`
              : result.step === 'account'
                ? `Could not sign in${where}`
                : 'Could not reach the server',
          message: result.message,
        });
        return;
      }
      if (result.notes.length) Alert.alert('Connected', result.notes.join('\n\n'));
      await onVerified(normalised.value, result.user);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField
        label="Primary address"
        hint="Tried first. Usually the one that only works at home, such as a LAN reverse proxy."
        placeholder="https://pokecollector.home.example"
        keyboardType="url"
        textContentType="URL"
        value={values.primaryUrl}
        onChangeText={set('primaryUrl')}
      />
      <TextField
        label="Fallback address (optional)"
        hint="Used whenever the primary does not answer, such as the public Cloudflare hostname."
        placeholder="https://pokecollector.example.com"
        keyboardType="url"
        textContentType="URL"
        value={values.fallbackUrl}
        onChangeText={set('fallbackUrl')}
      />
      <TextField
        label="Service token client ID"
        hint="From Cloudflare Zero Trust → Access → Service credentials. Sent to both addresses; a proxy without Access ignores it."
        value={values.accessClientId}
        onChangeText={set('accessClientId')}
      />
      <TextField
        label="Service token client secret"
        secureTextEntry
        value={values.accessClientSecret}
        onChangeText={set('accessClientSecret')}
      />
      <TextField
        label="PokeCollector username"
        textContentType="username"
        value={values.username}
        onChangeText={set('username')}
      />
      <TextField
        label="PokeCollector password"
        secureTextEntry
        textContentType="password"
        value={values.password}
        onChangeText={set('password')}
      />

      {error ? (
        <ThemedView background="surface" style={styles.error} accessibilityRole="alert">
          <ThemedText variant="label" color="danger">
            {error.title}
          </ThemedText>
          <ThemedText variant="caption">{error.message}</ThemedText>
        </ThemedView>
      ) : null}

      <Button title={submitTitle} busy={busy} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  error: { padding: spacing.md, borderRadius: 12, gap: spacing.xs },
});
