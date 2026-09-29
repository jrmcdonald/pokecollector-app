import {
  avatarImageSource,
  cardImageSource,
  collectionPhotoSource,
  scanPhotoSource,
} from '../images';

const proxy = { baseUrl: 'https://pc.example.com', headers: { 'CF-Access-Client-Id': 'id' } };

describe('cardImageSource', () => {
  it('uses the TCGdex URL directly, with no credentials', () => {
    const card = {
      id: 'sv1-001_en',
      images_small: 'https://assets.tcgdex.net/en/sv/sv01/001/low.webp',
      images_large: 'https://assets.tcgdex.net/en/sv/sv01/001/high.webp',
    };
    expect(cardImageSource(card, 'small', proxy)).toEqual({
      uri: card.images_small,
      cacheKey: card.images_small,
    });
    expect(cardImageSource(card, 'large', proxy)?.uri).toBe(card.images_large);
  });

  it('falls back to the other size before the proxy', () => {
    const card = {
      id: 'x',
      images_small: null,
      images_large: 'https://assets.tcgdex.net/x/high.webp',
    };
    expect(cardImageSource(card, 'small', proxy)?.uri).toBe(card.images_large);
  });

  it('sends custom cards through the proxy with the Access headers', () => {
    const card = { id: 'custom/1', custom_image_url: 'https://example.com/a.png' };
    expect(cardImageSource(card, 'large', proxy)).toEqual({
      uri: 'https://pc.example.com/api/images/card/custom%2F1/large',
      headers: proxy.headers,
      cacheKey: 'https://pc.example.com/api/images/card/custom%2F1/large',
    });
  });

  it('returns null when there is no image at all', () => {
    expect(cardImageSource({ id: 'x' }, 'small', proxy)).toBeNull();
  });
});

describe('avatarImageSource', () => {
  it("uses the server's cached artwork with the Access headers and an address-free cache key", () => {
    expect(avatarImageSource(25, proxy)).toEqual({
      uri: 'https://pc.example.com/api/pokedex/images/artwork/25.png',
      headers: proxy.headers,
      cacheKey: 'pokedex-artwork-25',
    });
  });

  it('has nothing for no avatar or one out of range', () => {
    expect(avatarImageSource(null, proxy)).toBeNull();
    expect(avatarImageSource(0, proxy)).toBeNull();
    expect(avatarImageSource(152, proxy)).toBeNull();
    expect(avatarImageSource(25, { baseUrl: '', headers: {} })).toBeNull();
  });
});

describe('collectionPhotoSource', () => {
  const withLogin = { ...proxy, token: 'jwt', scope: 'acct1' };

  it('sends the login as well as the Access headers, keyed per account and entry', () => {
    expect(collectionPhotoSource(42, withLogin)).toEqual({
      uri: 'https://pc.example.com/api/collection/42/photo',
      headers: { ...proxy.headers, Authorization: 'Bearer jwt' },
      cacheKey: 'collection-photo-acct1-42',
    });
  });

  it('has nothing without an entry or a login', () => {
    expect(collectionPhotoSource(null, withLogin)).toBeNull();
    expect(collectionPhotoSource(42, { ...withLogin, token: null })).toBeNull();
  });
});

describe('scanPhotoSource', () => {
  it('asks upstream for the photo with the login, cached per account, job and item', () => {
    expect(scanPhotoSource(4, 9, { ...proxy, token: 't', scope: 'acct' })).toEqual({
      uri: 'https://pc.example.com/api/cards/recognize/jobs/4/items/9/image',
      headers: { ...proxy.headers, Authorization: 'Bearer t' },
      cacheKey: 'scan-photo-acct-4-9',
    });
  });

  it('needs a login', () => {
    expect(scanPhotoSource(4, 9, { ...proxy, token: null, scope: 'acct' })).toBeNull();
  });
});
