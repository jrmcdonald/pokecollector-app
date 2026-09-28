import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useSession } from '@/session/session';
import { fonts, useColors } from '@/theme';
import { avatarImageSource } from '@/utils/images';
import { initialOf } from '@/utils/initial';

import { ThemedText } from './themed-text';

/**
 * An account's picture: the Pokémon chosen as its avatar in PokeCollector,
 * or the first letter of its name on the accent color when there is none or
 * it cannot be loaded.
 */
export function Avatar({
  name,
  avatarId,
  size = 40,
}: {
  name: string | null | undefined;
  avatarId?: number | null;
  size?: number;
}) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const { session } = useSession();
  const [failed, setFailed] = useState<number | null>(null);
  const proxy =
    session.status === 'signedIn'
      ? { baseUrl: session.client.activeBaseUrl, headers: session.client.accessHeaders }
      : { baseUrl: '', headers: {} };
  const source = failed === avatarId ? null : avatarImageSource(avatarId, proxy);
  const circle = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.circle,
        circle,
        source
          ? { backgroundColor: colors.surfaceRaised, borderColor: colors.accent, borderWidth: 1.5 }
          : { backgroundColor: colors.accent },
      ]}>
      {source ? (
        <Image
          source={source}
          style={{ width: size * 0.86, height: size * 0.86 }}
          contentFit="contain"
          accessibilityIgnoresInvertColors
          cachePolicy="disk"
          transition={reduceMotion ? 0 : 120}
          onError={() => setFailed(avatarId ?? null)}
        />
      ) : (
        <ThemedText
          style={{
            color: colors.onAccent,
            fontFamily: fonts.bold,
            fontSize: size * 0.45,
            lineHeight: size * 0.6,
          }}>
          {initialOf(name)}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
