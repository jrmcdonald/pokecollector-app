/**
 * After the walkthrough: compares this run's default-size screenshots with
 * the approved ones in e2e/screenshots, saves a diff image for each that
 * changed, and sums up the comparison and both audits for the job summary.
 *
 *   node e2e/report.ts --output e2e-output --approved e2e/screenshots
 *
 * Exits 1 when a screenshot changed, went missing or is new: each of those
 * needs a look, then approving (see e2e/README.md). The audit's own failure
 * is the walkthrough step's.
 *
 * Only the default size is compared. The largest-text screenshots are for
 * reading, in the run's artifact; the audit checks them for clipped text.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';

const { PNG } = pngjs;

/** Changed pixels allowed before a screenshot counts as different: anti-aliasing noise. */
const TOLERANCE = 0.001;

const { values } = parseArgs({
  options: {
    output: { type: 'string', default: 'e2e-output' },
    approved: { type: 'string', default: 'e2e/screenshots' },
  },
});
const output = values.output;
const approved = values.approved;

const lines: string[] = [];
const say = (line = '') => lines.push(line);
const pngs = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.png'))
        .sort()
    : [];
const readText = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8').trim() : '');

// --- Accessibility audit, per text size -----------------------------------

const SIZES: [dir: string, title: string][] = [
  ['default', 'default text size'],
  ['largest', 'largest accessibility text size'],
];

say('## Accessibility audit');
for (const [dir, title] of SIZES) {
  const file = join(output, dir, 'audit.tsv');
  if (!existsSync(file)) {
    say(`\n**${title}:** no report; the walkthrough did not get far enough to write one.`);
    continue;
  }
  const rows = readText(file)
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((row) => row.split('\t'));
  if (rows.length === 0) {
    say(`\n**${title}:** no issues.`);
    continue;
  }
  say(`\n**${title}:** ${rows.length} issue${rows.length === 1 ? '' : 's'}\n`);
  say('| Screen | Type | Issue | Element |');
  say('| --- | --- | --- | --- |');
  for (const [screen = '', type = '', issue = '', element = ''] of rows.slice(0, 150)) {
    const cell = (s: string) => s.replaceAll('|', '\\|');
    say(`| ${cell(screen)} | ${cell(type)} | ${cell(issue)} | ${cell(element)} |`);
  }
  if (rows.length > 150) say(`\n…and ${rows.length - 150} more in audit.tsv.`);
}

// --- Screenshots against the approved ones --------------------------------

say('\n## Screenshots');
const actualDir = join(output, 'default');
const diffDir = join(output, 'diff');
const actual = pngs(actualDir);
const expected = pngs(approved);
let failed = false;

if (actual.length === 0) {
  say('\nThe walkthrough saved no screenshots.');
  failed = true;
} else if (expected.length === 0) {
  say(
    `\nNo approved screenshots yet. This run saved ${actual.length}; check them in the ` +
      'artifact, then approve them (see e2e/README.md).',
  );
} else {
  const device = readText(join(output, 'device.txt'));
  const approvedDevice = readText(join(approved, 'device.txt'));
  if (device && approvedDevice && device !== approvedDevice) {
    say(
      `\nThe simulator changed from **${approvedDevice}** to **${device}**, so every ` +
        'screenshot differs. Check them and approve again.',
    );
    failed = true;
  }

  const rows: string[] = [];
  for (const name of [...new Set([...actual, ...expected])].sort()) {
    if (!expected.includes(name)) {
      rows.push(`| ${name} | new: not approved yet |`);
      failed = true;
      continue;
    }
    if (!actual.includes(name)) {
      rows.push(`| ${name} | missing from this run |`);
      failed = true;
      continue;
    }
    const a = PNG.sync.read(readFileSync(join(actualDir, name)));
    const b = PNG.sync.read(readFileSync(join(approved, name)));
    if (a.width !== b.width || a.height !== b.height) {
      rows.push(`| ${name} | size changed: ${b.width}×${b.height} → ${a.width}×${a.height} |`);
      failed = true;
      continue;
    }
    const diff = new PNG({ width: a.width, height: a.height });
    const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
    const share = changed / (a.width * a.height);
    if (share > TOLERANCE) {
      mkdirSync(diffDir, { recursive: true });
      writeFileSync(join(diffDir, name), PNG.sync.write(diff));
      rows.push(`| ${name} | changed: ${(share * 100).toFixed(2)}% of pixels |`);
      failed = true;
    }
  }
  if (rows.length === 0) {
    say(`\nAll ${expected.length} match the approved screenshots.`);
  } else {
    say('\n| Screenshot | Result |');
    say('| --- | --- |');
    for (const row of rows) say(row);
    say('\nDiff images are in the run artifact, under `diff/`.');
  }
}

const summary = lines.join('\n') + '\n';
process.stdout.write(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
process.exit(failed ? 1 : 0);
