/**
 * The phone's own copies of a batch's photos, for the review list's
 * thumbnails: fetching each photo back from the server would cost a request
 * apiece. They live in the cache directory, one folder per account and job,
 * named by upload position. iOS may clear the cache directory; the review
 * then shows a placeholder, and the photo's sheet fetches upstream's copy.
 */
import { Directory, File, Paths } from 'expo-file-system';

const ROOT = 'scan-batches';

/**
 * Jobs this app run saved photos for. Pruning skips them: an inbox fetched
 * just before an upload finished does not list the new job yet.
 */
const savedThisRun = new Set<string>();

function jobDirectory(scope: string, jobId: number): Directory {
  return new Directory(Paths.cache, ROOT, scope, String(jobId));
}

/** Moves a batch's photos, in upload order, to the job's folder. Best effort. */
export async function keepBatchPhotos(
  scope: string,
  jobId: number,
  photos: readonly File[],
): Promise<void> {
  savedThisRun.add(`${scope}/${jobId}`);
  try {
    const directory = jobDirectory(scope, jobId);
    directory.create({ intermediates: true, idempotent: true });
    await Promise.all(
      photos.map((photo, position) =>
        photo.move(new File(directory, `${position}.jpg`), { overwrite: true }),
      ),
    );
  } catch {
    // Thumbnails are a convenience; the review works without them.
  }
}

/** The phone's copy of the photo at `position`, if it is still there. */
export function batchPhotoUri(
  scope: string,
  jobId: number,
  position: number | null | undefined,
): string | null {
  if (position === null || position === undefined) return null;
  try {
    const file = new File(jobDirectory(scope, jobId), `${position}.jpg`);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/** Deletes a job's photos, once it is finished with or discarded. */
export function forgetBatchPhotos(scope: string, jobId: number): void {
  savedThisRun.delete(`${scope}/${jobId}`);
  try {
    const directory = jobDirectory(scope, jobId);
    if (directory.exists) directory.delete();
  } catch {
    // Best effort: iOS clears the cache directory itself.
  }
}

/**
 * Deletes the photos of every job of this account that is no longer in the
 * inbox (all handled, expired, or deleted in the web UI).
 */
export function pruneBatchPhotos(scope: string, keepJobIds: readonly number[]): void {
  const keep = new Set(keepJobIds.map(String));
  try {
    const directory = new Directory(Paths.cache, ROOT, scope);
    if (!directory.exists) return;
    for (const entry of directory.list()) {
      if (!(entry instanceof Directory)) continue;
      if (keep.has(entry.name) || savedThisRun.has(`${scope}/${entry.name}`)) continue;
      entry.delete();
    }
  } catch {
    // Best effort.
  }
}
