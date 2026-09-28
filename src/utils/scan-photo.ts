/**
 * Turns a captured photo into what gets uploaded: the part under the card
 * guide (with a little room around it), shrunk to about 1200 px on the long
 * edge, as a JPEG at quality 0.85. A photo straight off the camera is several
 * megabytes; this is usually a few hundred kilobytes, which matters on a
 * phone connection and through Cloudflare.
 */
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { cropForGuide, downscaleTo, guideRect, type Size } from './crop';

export async function prepareScanPhoto(
  photo: { uri: string; width: number; height: number },
  view: Size,
): Promise<File> {
  const crop = cropForGuide(photo, view, guideRect(view));
  let context = ImageManipulator.manipulate(photo.uri).crop({
    originX: crop.x,
    originY: crop.y,
    width: crop.width,
    height: crop.height,
  });
  const size = downscaleTo(crop);
  if (size) context = context.resize(size);
  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    return new File(saved.uri);
  } finally {
    image.release();
  }
}
