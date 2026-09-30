/**
 * Photos of cards from the phone's library, for scanning like a camera photo.
 *
 * iOS's photo picker runs outside the app and hands back only what was
 * chosen, so this needs no access to the library as a whole and asks for
 * none. The picker copies each photo into the app's cache directory, where
 * it can be shrunk and deleted like a camera photo.
 */
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { prepareScanPhoto } from './scan-photo';

/** Up to `limit` photos, in the order they were picked; none if cancelled. */
export async function pickFromLibrary(limit: number): Promise<string[]> {
  if (limit < 1) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    orderedSelection: true,
    // Shrunk and re-encoded before upload anyway (`prepareScanPhoto`).
    quality: 1,
    exif: false,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => asset.uri);
}

/**
 * Picks up to `limit` photos and shrinks each as a scan would, deleting the
 * picker's full-size copies. `failed` counts the ones that could not be read.
 */
export async function photosFromLibrary(limit: number): Promise<{ files: File[]; failed: number }> {
  const uris = await pickFromLibrary(limit);
  const files: File[] = [];
  let failed = 0;
  for (const uri of uris) {
    try {
      files.push(await prepareScanPhoto(uri, null));
    } catch {
      failed += 1;
    } finally {
      try {
        new File(uri).delete();
      } catch {
        // Best effort: iOS clears the cache directory itself.
      }
    }
  }
  return { files, failed };
}
