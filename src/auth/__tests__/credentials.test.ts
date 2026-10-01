import {
  EMPTY_INPUT,
  newCacheId,
  normaliseCredentials,
  sameAccount,
  toInput,
  type CredentialsInput,
} from '../credentials';

const valid: CredentialsInput = {
  ...EMPTY_INPUT,
  primaryUrl: ' https://home.example.com/some/path/ ',
  fallbackUrl: ' pc.example.com ',
  proxyKind: 'cloudflare',
  clientId: ' id.access ',
  clientSecret: ' secret ',
  username: ' ash ',
  password: ' pass ',
};

describe('normaliseCredentials', () => {
  it('trims fields, keeps the password as typed, and reduces URLs to their origin', () => {
    expect(normaliseCredentials(valid)).toEqual({
      ok: true,
      value: {
        primaryUrl: 'https://home.example.com',
        fallbackUrl: 'https://pc.example.com',
        proxy: { kind: 'cloudflare', clientId: 'id.access', clientSecret: 'secret' },
        username: 'ash',
        password: ' pass ',
      },
    });
  });

  it('treats a blank fallback, or one equal to the primary, as none', () => {
    expect(normaliseCredentials({ ...valid, fallbackUrl: '  ' })).toMatchObject({
      ok: true,
      value: { fallbackUrl: null },
    });
    expect(
      normaliseCredentials({ ...valid, fallbackUrl: 'https://home.example.com/' }),
    ).toMatchObject({ ok: true, value: { fallbackUrl: null } });
  });

  it('requires a primary address', () => {
    expect(normaliseCredentials({ ...valid, primaryUrl: '' })).toEqual({
      ok: false,
      error: 'The primary server address is required.',
    });
  });

  it('refuses plain http for either address', () => {
    expect(normaliseCredentials({ ...valid, primaryUrl: 'http://home.example.com' })).toEqual({
      ok: false,
      error: 'The primary server address must use https.',
    });
    expect(normaliseCredentials({ ...valid, fallbackUrl: 'http://pc.example.com' })).toEqual({
      ok: false,
      error: 'The fallback server address must use https.',
    });
  });

  it('requires the account', () => {
    expect(normaliseCredentials({ ...valid, password: '' }).ok).toBe(false);
    expect(normaliseCredentials({ ...valid, username: ' ' }).ok).toBe(false);
  });

  describe('the proxy', () => {
    it('saves none, ignoring a token typed before switching away', () => {
      expect(normaliseCredentials({ ...valid, proxyKind: 'none' })).toMatchObject({
        ok: true,
        value: { proxy: { kind: 'none' } },
      });
    });

    it('needs both halves of a Cloudflare service token', () => {
      expect(normaliseCredentials({ ...valid, clientSecret: ' ' })).toEqual({
        ok: false,
        error: 'Enter both parts of the Cloudflare service token.',
      });
    });

    it('saves custom headers trimmed, leaving out rows left blank', () => {
      const result = normaliseCredentials({
        ...valid,
        proxyKind: 'headers',
        headers: [
          { name: ' X-Api-Key ', value: ' k1 ' },
          { name: '', value: '' },
        ],
      });
      expect(result).toMatchObject({
        ok: true,
        value: { proxy: { kind: 'headers', headers: [{ name: 'X-Api-Key', value: 'k1' }] } },
      });
    });

    it.each([
      [[{ name: '', value: '' }], 'Add at least one header for the proxy, or choose None.'],
      [
        [{ name: 'Not a header', value: 'x' }],
        '“Not a header” is not a valid header name: letters, digits and dashes only.',
      ],
      [
        [{ name: 'Authorization', value: 'x' }],
        'The app sets Authorization itself, so it cannot be a proxy header.',
      ],
      [[{ name: 'X-Key', value: '  ' }], 'X-Key needs a value on one line.'],
      [[{ name: 'X-Key', value: 'a\nb' }], 'X-Key needs a value on one line.'],
      [
        [
          { name: 'X-Key', value: 'a' },
          { name: 'x-key', value: 'b' },
        ],
        'x-key is there twice.',
      ],
    ])('refuses unusable headers: %j', (headers, error) => {
      expect(normaliseCredentials({ ...valid, proxyKind: 'headers', headers })).toEqual({
        ok: false,
        error,
      });
    });

    it('allows at most five headers', () => {
      const headers = Array.from({ length: 6 }, (_, i) => ({ name: `X-${i}`, value: 'v' }));
      expect(normaliseCredentials({ ...valid, proxyKind: 'headers', headers })).toEqual({
        ok: false,
        error: 'Up to 5 proxy headers can be sent.',
      });
    });
  });

  it('keeps a cache id only for the same account on the same server', () => {
    const saved = normaliseCredentials(valid);
    if (!saved.ok) throw new Error('expected valid');
    const a = saved.value;
    expect(sameAccount(a, { ...a, password: 'new', proxy: { kind: 'none' } })).toBe(true);
    expect(sameAccount(a, { ...a, username: 'misty' })).toBe(false);
    expect(sameAccount(a, { ...a, primaryUrl: 'https://other.example.com' })).toBe(false);
    expect(newCacheId()).not.toBe(newCacheId());
  });

  it('round-trips saved credentials through the form, for each kind of proxy', () => {
    const saved = normaliseCredentials(valid);
    if (!saved.ok) throw new Error('expected valid');
    for (const proxy of [
      { kind: 'none' as const },
      saved.value.proxy,
      { kind: 'headers' as const, headers: [{ name: 'X-Api-Key', value: 'k' }] },
    ]) {
      const credentials = { ...saved.value, fallbackUrl: null, proxy };
      expect(normaliseCredentials(toInput(credentials))).toEqual({ ok: true, value: credentials });
    }
  });
});
