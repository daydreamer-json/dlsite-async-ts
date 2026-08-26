/** File/stream helpers: atomic downloads, XOR transforms, existence checks. */

import { open, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { DlsiteError } from "./exceptions.js";

/** Transform a downloaded chunk before writing it to disk. */
export type ChunkTransform = (
  chunk: Uint8Array,
  offset: number,
) => Uint8Array;

/** XOR every byte of `data` against the repeating `key`. */
export function xorBytes(
  data: Uint8Array,
  key: Uint8Array,
  offset = 0,
): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    out[i] = (data[i] ?? 0) ^ (key[(offset + i) % key.length] ?? 0);
  }
  return out;
}

/** Chunked XOR transform for {@link streamToFile}. */
export function xorTransform(key: Uint8Array): ChunkTransform {
  return (chunk, offset) => xorBytes(chunk, key, offset);
}

/**
 * Stream the response body into `destPath` via a temp file that replaces the
 * destination atomically on success (and is removed on failure).
 *
 * Note: like POSIX ``os.replace``, an existing destination is overwritten;
 * on Windows Node's rename may fail when the destination exists.
 */
export async function streamToFile(
  response: Response,
  destPath: string,
  transform?: ChunkTransform,
): Promise<void> {
  const tempPath = join(
    dirname(destPath),
    `.${basename(destPath)}.${crypto.randomUUID()}.tmp`,
  );
  const body = response.body;
  if (body === null) {
    throw new DlsiteError("Response body is empty");
  }
  const handle = await open(tempPath, "w");
  const reader = body.getReader();
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || value === undefined) {
        break;
      }
      const chunk = transform !== undefined ? transform(value, offset) : value;
      offset += value.byteLength;
      await handle.write(chunk);
    }
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(tempPath).catch(() => {});
    throw error;
  }
  await handle.close();
  await rename(tempPath, destPath);
}

/** Return whether the path exists. */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
