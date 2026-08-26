/** File/stream helpers: atomic downloads, XOR transforms, existence checks. */
/** Transform a downloaded chunk before writing it to disk. */
export type ChunkTransform = (chunk: Uint8Array, offset: number) => Uint8Array;
/** XOR every byte of `data` against the repeating `key`. */
export declare function xorBytes(data: Uint8Array, key: Uint8Array, offset?: number): Uint8Array;
/** Chunked XOR transform for {@link streamToFile}. */
export declare function xorTransform(key: Uint8Array): ChunkTransform;
/**
 * Stream the response body into `destPath` via a temp file that replaces the
 * destination atomically on success (and is removed on failure).
 *
 * Note: like POSIX ``os.replace``, an existing destination is overwritten;
 * on Windows Node's rename may fail when the destination exists.
 */
export declare function streamToFile(response: Response, destPath: string, transform?: ChunkTransform): Promise<void>;
/** Return whether the path exists. */
export declare function pathExists(path: string): Promise<boolean>;
//# sourceMappingURL=stream.d.ts.map