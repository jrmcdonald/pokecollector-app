import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConnectionForm } from '@/components/connection-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/session/session';
import { spacing } from '@/theme';

export default function Onboarding() {
  const { signIn } = useSession();
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView behavior="padding" style={styles.fill}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText variant="title">PokeCollector</ThemedText>
            <ThemedText color="textSecondary">
              Connect to your PokeCollector server. Everything you enter stays in this phone&apos;s
              Keychain.
            </ThemedText>
            <ConnectionForm
              submitTitle="Connect"
              onVerified={(credentials) => signIn(credentials)}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
});
