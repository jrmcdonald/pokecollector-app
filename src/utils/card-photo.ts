/**
 * A photo of the owner's own copy of a card, for a card the catalogue has no
 * picture of. Taken with the system camera or chosen from the library (both
 * iOS's own screens, through expo-image-picker), then shrunk and re-encoded
 * as a scan photo is, so the upload is a few hundred KB.
 */
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { pickFromLibrary } from './library';
import { prepareScanPhoto } from './scan-photo';

export type PhotoSource = 'camera' | 'library';

/** The camera is not allowed; Settings is the only place to change that. */
export class CameraDeniedError extends Error {
  constructor() {
    super('Camera access is off');
  }
}

/** The photo ready to upload, or null if the person cancelled. */
export async function takeCardPhoto(source: PhotoSource): Promise<File | null> {
  let uri: string | undefined;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new CameraDeniedError();
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 1,
      exif: false,
    });
    uri = result.canceled ? undefined : result.assets[0]?.uri;
  } else {
    uri = (await pickFromLibrary(1))[0];
  }
  if (!uri) return null;
  try {
    return await prepareScanPhoto(uri, null);
  } finally {
    try {
      new File(uri).delete();
    } catch {
      // Best effort: iOS clears the cache directory itself.
    }
  }
}
