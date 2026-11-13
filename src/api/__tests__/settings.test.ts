import { PokeCollectorClient } from '../client';
import { getHoloEffectsSetting, setHoloEffectsSetting } from '../endpoints';
import { settingFlag } from '../schemas';
import { CREDENTIALS, fakeFetch, loginOk } from './fake-server';

const URL = 'https://pc.example.com/api/settings/holo_effects_enabled';

function serverWith(reply: { status: number; body?: unknown }) {
  const server = fakeFetch(({ url }) => (url.endsWith('/login') ? loginOk('t') : reply));
  return { ...server, client: new PokeCollectorClient(CREDENTIALS, server.fetch) };
}

describe('settingFlag', () => {
  it('is on only for the string "true", as the web UI reads it', () => {
    expect(settingFlag('true')).toBe(true);
    expect(settingFlag('false')).toBe(false);
    expect(settingFlag(undefined)).toBe(false);
    expect(settingFlag(null)).toBe(false);
    expect(settingFlag('')).toBe(false);
    expect(settingFlag(true)).toBe(false);
  });
});

describe('the holo effects setting', () => {
  it('reads "true" as on and "false" as off', async () => {
    const on = serverWith({ status: 200, body: { key: 'holo_effects_enabled', value: 'true' } });
    await expect(getHoloEffectsSetting(on.client)).resolves.toBe(true);
    expect(on.calls[1]?.url).toBe(URL);
    const off = serverWith({ status: 200, body: { key: 'holo_effects_enabled', value: 'false' } });
    await expect(getHoloEffectsSetting(off.client)).resolves.toBe(false);
  });

  it('is off when the server does not know it (before upstream 1.56.0)', async () => {
    const { client } = serverWith({
      status: 404,
      body: { detail: 'Setting holo_effects_enabled not found' },
    });
    await expect(getHoloEffectsSetting(client)).resolves.toBe(false);
  });

  it('is off when the value is missing', async () => {
    const { client } = serverWith({ status: 200, body: { key: 'holo_effects_enabled' } });
    await expect(getHoloEffectsSetting(client)).resolves.toBe(false);
  });

  it('passes on other failures rather than guessing', async () => {
    const { client } = serverWith({ status: 500, body: { detail: 'boom' } });
    await expect(getHoloEffectsSetting(client)).rejects.toThrow();
  });

  it('writes the string upstream stores, and returns what it stored', async () => {
    const { client, calls } = serverWith({
      status: 200,
      body: { key: 'holo_effects_enabled', value: 'true' },
    });
    await expect(setHoloEffectsSetting(client, true)).resolves.toBe(true);
    expect(calls[1]?.method).toBe('POST');
    expect(calls[1]?.url).toBe(URL);
    expect(calls[1]?.body).toBe('{"value":"true"}');
  });
});
