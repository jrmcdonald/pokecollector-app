import { builtApp, plainNotes, source, type Release } from '../source.ts';

const INFO = {
  CFBundleIdentifier: 'com.example.pokecollector',
  CFBundleShortVersionString: '1.2.0',
  CFBundleVersion: '241',
  MinimumOSVersion: '16.4',
  NSCameraUsageDescription: 'Scans cards.',
  NSPhotoLibraryUsageDescription: 'Reads the photos you choose.',
  NSFaceIDUsageDescription: 7,
  UIRequiredDeviceCapabilities: ['arm64'],
};

const NOTES = `## [1.2.0](https://github.com/example/app/compare/v1.1.0...v1.2.0) (2026-10-02)


### Features

* **scan:** run the camera behind the tab bar ([eb3e769](https://github.com/example/app/commit/eb3e769abc))
* any proxy in front of the server ([#11](https://github.com/example/app/issues/11)) ([b6c73d7](https://github.com/example/app/commit/b6c73d7))

### Bug Fixes

* close a stray keyboard, closes [#9](https://github.com/example/app/issues/9) ([30d66c4](https://github.com/example/app/commit/30d66c4))
`;

const RELEASE: Release = {
  repository: 'example/app',
  tag: 'v1.2.0',
  date: '2026-10-02T10:00:00Z',
  notes: NOTES,
  ipaName: 'PokeCollector-1.2.0.ipa',
  size: 12_345_678,
  sha256: 'ab'.repeat(32),
};

describe('builtApp', () => {
  it('reads the version, build and privacy strings from Info.plist', () => {
    expect(builtApp(INFO, { 'keychain-access-groups': [], 'aps-environment': 'x' })).toEqual({
      bundleIdentifier: 'com.example.pokecollector',
      version: '1.2.0',
      buildVersion: '241',
      minOSVersion: '16.4',
      privacy: {
        NSCameraUsageDescription: 'Scans cards.',
        NSPhotoLibraryUsageDescription: 'Reads the photos you choose.',
      },
      entitlements: ['aps-environment', 'keychain-access-groups'],
    });
  });

  it('has no entitlements for an unsigned build', () => {
    expect(builtApp(INFO).entitlements).toEqual([]);
  });

  it('refuses an Info.plist without a build number', () => {
    const { CFBundleVersion: _, ...info } = INFO;
    expect(() => builtApp(info)).toThrow('CFBundleVersion');
  });
});

describe('plainNotes', () => {
  it('keeps sections and entries, without links or hashes', () => {
    expect(plainNotes(NOTES)).toBe(
      [
        'Features',
        '• scan: run the camera behind the tab bar',
        '• any proxy in front of the server',
        '',
        'Bug Fixes',
        '• close a stray keyboard',
      ].join('\n'),
    );
  });

  it('says something when a release has no notable entries', () => {
    expect(plainNotes('## [1.2.1](https://example.com) (2026-10-03)\n')).toBe(
      'Maintenance and small fixes.',
    );
  });
});

describe('source', () => {
  const app = builtApp(INFO);

  it('describes the release the way SideStore checks it', () => {
    const json = source(app, RELEASE);
    const [entry] = json.apps;
    expect(entry?.bundleIdentifier).toBe('com.example.pokecollector');
    expect(entry?.versions).toEqual([
      {
        version: '1.2.0',
        buildVersion: '241',
        date: '2026-10-02T10:00:00Z',
        localizedDescription: plainNotes(NOTES),
        downloadURL:
          'https://github.com/example/app/releases/download/v1.2.0/PokeCollector-1.2.0.ipa',
        size: 12_345_678,
        sha256: 'ab'.repeat(32),
        minOSVersion: '16.4',
      },
    ]);
    expect(entry?.downloadURL).toBe(entry?.versions[0]?.downloadURL);
    expect(entry?.appPermissions).toEqual({ entitlements: [], privacy: app.privacy });
  });

  it('points images at the tagged commit', () => {
    const json = source(app, RELEASE);
    expect(json.iconURL).toBe(
      'https://raw.githubusercontent.com/example/app/v1.2.0/assets/images/icon.png',
    );
    expect(json.apps[0]?.screenshots[0]?.imageURL).toBe(
      'https://raw.githubusercontent.com/example/app/v1.2.0/e2e/screenshots/home.png',
    );
    expect(json.apps[0]?.developerName).toBe('example');
  });

  it('refuses a build whose version is not the tag', () => {
    expect(() => source(app, { ...RELEASE, tag: 'v1.3.0' })).toThrow(
      'Release v1.3.0 holds a build of version 1.2.0',
    );
  });
});
