import { normaliseCredentials } from '../credentials';

const valid = {
  baseUrl: ' https://pc.example.com/some/path/ ',
  accessClientId: ' id.access ',
  accessClientSecret: ' secret ',
  username: ' ash ',
  password: ' pass ',
};

describe('normaliseCredentials', () => {
  it('trims fields, keeps the password as typed, and reduces the URL to its origin', () => {
    expect(normaliseCredentials(valid)).toEqual({
      ok: true,
      value: {
        baseUrl: 'https://pc.example.com',
        accessClientId: 'id.access',
        accessClientSecret: 'secret',
        username: 'ash',
        password: ' pass ',
      },
    });
  });

  it('assumes https when no scheme is given', () => {
    const result = normaliseCredentials({ ...valid, baseUrl: 'pc.example.com' });
    expect(result).toMatchObject({ ok: true, value: { baseUrl: 'https://pc.example.com' } });
  });

  it('refuses plain http', () => {
    expect(normaliseCredentials({ ...valid, baseUrl: 'http://pc.example.com' })).toEqual({
      ok: false,
      error: 'The server address must use https.',
    });
  });

  it('requires both halves of the service token and the account', () => {
    expect(normaliseCredentials({ ...valid, accessClientSecret: ' ' }).ok).toBe(false);
    expect(normaliseCredentials({ ...valid, password: '' }).ok).toBe(false);
  });
});
