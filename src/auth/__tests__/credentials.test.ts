import { normaliseCredentials, toInput } from '../credentials';

const valid = {
  primaryUrl: ' https://home.example.com/some/path/ ',
  fallbackUrl: ' pc.example.com ',
  accessClientId: ' id.access ',
  accessClientSecret: ' secret ',
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
        accessClientId: 'id.access',
        accessClientSecret: 'secret',
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

  it('requires both halves of the service token and the account', () => {
    expect(normaliseCredentials({ ...valid, accessClientSecret: ' ' }).ok).toBe(false);
    expect(normaliseCredentials({ ...valid, password: '' }).ok).toBe(false);
  });

  it('round-trips saved credentials through the form', () => {
    const saved = normaliseCredentials(valid);
    if (!saved.ok) throw new Error('expected valid');
    expect(normaliseCredentials(toInput({ ...saved.value, fallbackUrl: null }))).toMatchObject({
      ok: true,
      value: { fallbackUrl: null },
    });
  });
});
