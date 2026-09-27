import { router } from 'expo-router';

import { Button } from '@/components/button';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function More() {
  return (
    <PlaceholderScreen title="More" description="Wishlist and sets arrive in phase 2.">
      <Button title="Settings" variant="secondary" onPress={() => router.push('/settings')} />
    </PlaceholderScreen>
  );
}
