/**
 * Writes source.json for a release, from the IPA and the built app's
 * Info.plist and entitlements (converted to JSON on the macOS runner).
 *
 *   node scripts/release/write-source.ts --ipa PokeCollector-1.0.0.ipa \
 *     --info info.json [--entitlements entitlements.json] \
 *     --repository owner/name --tag v1.0.0 --date 2026-10-02T10:00:00Z \
 *     --notes notes.md --out source.json
 *
 * See source.ts for what goes in it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';

import { builtApp, source } from './source.ts';

const { values } = parseArgs({
  options: {
    ipa: { type: 'string' },
    info: { type: 'string' },
    entitlements: { type: 'string' },
    repository: { type: 'string' },
    tag: { type: 'string' },
    date: { type: 'string' },
    notes: { type: 'string' },
    out: { type: 'string' },
  },
});

function required(name: keyof typeof values): string {
  const value = values[name];
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

const ipa = required('ipa');
const entitlements = values.entitlements;
const app = builtApp(
  readJson(required('info')),
  entitlements && existsSync(entitlements) ? readJson(entitlements) : {},
);

const json = source(app, {
  repository: required('repository'),
  tag: required('tag'),
  date: required('date'),
  notes: readFileSync(required('notes'), 'utf8'),
  ipaName: basename(ipa),
  size: statSync(ipa).size,
  sha256: createHash('sha256').update(readFileSync(ipa)).digest('hex'),
});

writeFileSync(required('out'), `${JSON.stringify(json, null, 2)}\n`);
console.log(
  `Wrote ${required('out')} for ${app.bundleIdentifier} ${app.version} (${app.buildVersion})`,
);
