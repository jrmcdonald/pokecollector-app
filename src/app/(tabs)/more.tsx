import { router, type Href } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { spacing } from '@/theme';

const ITEMS: { title: string; subtitle: string; href: Href }[] = [
  { title: 'Wishlist', subtitle: 'Cards you want, and what they cost', href: '/wishlist' },
  { title: 'Sets', subtitle: 'Completion and checklists', href: '/sets' },
  { title: 'Settings', subtitle: 'Account, connection and cache', href: '/settings' },
];

export default function More() {
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['top']} style={styles.fill}>
        <ScrollView>
          <ThemedText variant="title" style={styles.title}>
            More
          </ThemedText>
          {ITEMS.map((item) => (
            <ListRow
              key={item.title}
              title={item.title}
              subtitle={item.subtitle}
              onPress={() => router.push(item.href)}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
});
