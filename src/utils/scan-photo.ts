/**
 * Turns a photo into what gets uploaded: shrunk to about 1200 px on the long
 * edge, as a JPEG at quality 0.85. A photo straight off the camera is several
 * megabytes; this is usually a few hundred kilobytes, which matters on a
 * phone connection and through Cloudflare.
 *
 * A photo from the camera is first cropped to the part under the card guide
 * (with a little room around it). One from the library is not: nothing lined
 * it up with the guide, so the model gets all of it.
 */
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { cropForGuide, downscaleTo, type CameraFrame, type Size } from './crop';

/**
 * @param uri A local photo, in any orientation: the manipulator applies its
 *   EXIF orientation as it loads it, so sizes below are as the photo is seen.
 * @param frame The camera view the photo was taken in and its guide, or null
 *   for a photo from the library.
 */
export async function prepareScanPhoto(uri: string, frame: CameraFrame | null): Promise<File> {
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  let image = source;
  try {
    let context = ImageManipulator.manipulate(source);
    let size: Size = { width: source.width, height: source.height };
    if (frame) {
      const crop = cropForGuide(size, frame.view, frame.guide);
      context = context.crop({
        originX: crop.x,
        originY: crop.y,
        width: crop.width,
        height: crop.height,
      });
      size = crop;
    }
    const smaller = downscaleTo(size);
    if (smaller) context = context.resize(smaller);
    image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    return new File(saved.uri);
  } finally {
    if (image !== source) image.release();
    source.release();
  }
}
