/**
 * The Wishlist's last layout, a list or a grid of its cards, kept between
 * visits. Not a secret, so AsyncStorage, as for the Scan tab's mode; a
 * failure only means the wishlist opens as a list.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WishlistLayout = 'list' | 'grid';

const KEY = 'pokecollector.wishlist-layout';

export async function loadWishlistLayout(): Promise<WishlistLayout | null> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return value === 'list' || value === 'grid' ? value : null;
  } catch {
    return null;
  }
}

export function saveWishlistLayout(layout: WishlistLayout): void {
  AsyncStorage.setItem(KEY, layout).catch(() => undefined);
}
