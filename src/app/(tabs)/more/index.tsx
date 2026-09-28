import { router, type Href } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { ListRow } from '@/components/list-row';
import { ThemedView } from '@/components/themed-view';

const ITEMS: { title: string; subtitle: string; href: Href }[] = [
  { title: 'Wishlist', subtitle: 'Cards you want, and what they cost', href: '/wishlist' },
  { title: 'Sets', subtitle: 'Completion and checklists', href: '/sets' },
  { title: 'Settings', subtitle: 'Accounts, connection and cache', href: '/settings' },
];

export default function More() {
  return (
    <ThemedView style={styles.fill}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        {ITEMS.map((item) => (
          <ListRow
            key={item.title}
            title={item.title}
            subtitle={item.subtitle}
            onPress={() => router.push(item.href)}
          />
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
