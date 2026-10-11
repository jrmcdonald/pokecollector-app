import { Linking } from 'react-native';

import { Button } from '@/components/button';
import { marketplaces, type MarketCard } from '@/utils/marketplaces';
import { pick } from '@/utils/pick';
import { showToast } from '@/utils/toast';

/**
 * "Find for sale": eBay, Cardmarket and TCGplayer in an action sheet. Links
 * only, so it works offline and costs no request.
 */
export function FindForSale({ card }: { card: MarketCard }) {
  async function choose() {
    const shops = marketplaces(card);
    const index = await pick(
      card.name,
      shops.map((shop) => shop.label),
    );
    const shop = index === null ? undefined : shops[index];
    if (shop) openMarketplace(shop.url);
  }

  return (
    <Button
      title="Find for sale"
      variant="secondary"
      accessibilityHint="Searches eBay, Cardmarket or TCGplayer for this card."
      onPress={choose}
    />
  );
}

/** Opens a marketplace in its app if installed (eBay's links are universal links), or Safari. */
export function openMarketplace(url: string) {
  Linking.openURL(url).catch(() =>
    showToast({ kind: 'error', title: 'Could not open the link', message: url }),
  );
}
