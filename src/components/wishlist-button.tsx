import type { StyleProp, ViewStyle } from 'react-native';

import { useAddToWishlist, useRemoveFromWishlist, useWishlist } from '@/hooks/queries';

import { Button } from './button';

/** What is on the wishlist changes rarely; this only needs to know whether a card is. */
const WISHLIST_STALE_MS = 30 * 60 * 1000;

/**
 * Adds a card to the wishlist, or, once it is there, takes it off again:
 * one button that says what it will do. Removing is undone by adding again,
 * so it asks nothing first.
 *
 * `cachedOnly` reads the wishlist only if it is already cached, for a
 * look-up that should cost no request for it. Without the wishlist, a card
 * just added says so, but cannot be taken off from here.
 */
export function WishlistButton({
  cardId,
  disabled,
  cachedOnly = false,
  style,
}: {
  cardId: string;
  disabled: boolean;
  cachedOnly?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const wishlist = useWishlist({ staleTime: WISHLIST_STALE_MS, enabled: !cachedOnly });
  const add = useAddToWishlist();
  const remove = useRemoveFromWishlist();
  const item = wishlist.data?.find((entry) => entry.card_id === cardId);

  if (item) {
    return (
      <Button
        title="Remove from wishlist"
        variant="secondary"
        style={style}
        busy={remove.isPending}
        disabled={disabled}
        onPress={() => {
          add.reset();
          remove.mutate(item);
        }}
      />
    );
  }
  // Added, but the wishlist is not here to say which entry to take off.
  const added = add.isSuccess && !remove.isPending;
  return (
    <Button
      title={added ? 'On your wishlist' : 'Add to wishlist'}
      variant="secondary"
      style={style}
      busy={add.isPending || wishlist.isLoading}
      disabled={disabled || added}
      onPress={() => add.mutate(cardId)}
    />
  );
}
