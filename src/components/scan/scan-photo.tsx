import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ScanItem } from '@/api/schemas';
import { CARD_ASPECT } from '@/components/card-image';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/session/session';
import { radius, useColors } from '@/theme';
import { batchPhotoUri } from '@/utils/batch-photos';
import { scanPhotoSource } from '@/utils/images';

/**
 * The photo taken of a card in a batch: the phone's own copy when it still
 * has one. `remote` allows fetching upstream's copy otherwise, which costs a
 * request, so only the photo being reviewed asks for it; lists show a
 * numbered placeholder instead.
 */
export function ScanPhoto({
  jobId,
  item,
  remote = false,
  style,
}: {
  jobId: number;
  item: Pick<ScanItem, 'id' | 'position' | 'has_image'>;
  remote?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const { session } = useSession();
  const scope = session.status === 'signedIn' ? session.cacheId : null;
  const local = useMemo(
    () => (scope ? batchPhotoUri(scope, jobId, item.position) : null),
    [scope, jobId, item.position],
  );
  const source = local
    ? { uri: local }
    : remote && item.has_image && session.status === 'signedIn'
      ? scanPhotoSource(jobId, item.id, {
          baseUrl: session.client.activeBaseUrl,
          headers: session.client.proxyHeaders,
          token: session.client.sessionToken,
          scope: session.cacheId,
        })
      : null;
  const number = (item.position ?? 0) + 1;

  return (
    <View
      style={[styles.frame, { backgroundColor: colors.surfaceRaised }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Your photo ${number}`}
      accessibilityIgnoresInvertColors>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityIgnoresInvertColors
          recyclingKey={`${jobId}-${item.id}`}
          cachePolicy={local ? 'none' : 'disk'}
        />
      ) : (
        <View style={styles.placeholder}>
          <Icon name="camera" size={16} color="textSecondary" />
          <ThemedText variant="figureSmall" color="textSecondary">
            {number}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: CARD_ASPECT, borderRadius: radius.sm, overflow: 'hidden' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
