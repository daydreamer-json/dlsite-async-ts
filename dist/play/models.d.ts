/** Play API response models. */
import { DateTime } from "luxon";
/** Play API download token. */
export declare class DownloadToken {
    readonly expiresAt: DateTime;
    readonly url: string;
    constructor(fields: {
        expiresAt: DateTime;
        url: string;
    });
    /** Construct a DownloadToken from JSON response.
  
     * Throws:
     *   DlsiteError: An error occurred.
     */
    static fromJson(data: Record<string, unknown>): DownloadToken;
    /** Return expiration as a POSIX timestamp. */
    get expiration(): number;
}
/** File metadata attached to a {@link PlayFile}. */
export type PlayFileInfo = Record<string, unknown>;
/** DLsite Play play-able file. */
export declare class PlayFile {
    readonly length: number;
    readonly type: string;
    readonly files: Record<string, PlayFileInfo>;
    readonly hashname: string;
    constructor(fields: {
        length: number;
        type: string;
        files: Record<string, PlayFileInfo>;
        hashname: string;
    });
    /** Construct a PlayFile from ``ziptree`` JSON playfile data. */
    static fromJson(data: Record<string, unknown>, hashname?: string): PlayFile;
    /** Return length as human readable size. */
    get size(): string;
    private optimizedInfo;
    /** Return optimized file name. */
    get optimizedName(): string;
    /** Return optimized file length in bytes. */
    get optimizedLength(): number;
    get isEbook(): boolean;
    /** @deprecated Use {@link PlayFile.isEpubFixed} instead. */
    get isEpub(): boolean;
    get isEpubFixed(): boolean;
    get isEpubReflowable(): boolean;
}
/** ZipTree tree file entry. */
export interface TreeFileEntry {
    readonly type: "file";
    readonly hashname: string;
    readonly name: string;
}
/** ZipTree hidden file entry. */
export interface TreeHiddenEntry {
    readonly type: "hidden";
    readonly hashname: string;
    readonly name: string;
}
/** ZipTree tree folder entry. */
export interface TreeFolderEntry {
    readonly type: "folder";
    readonly children: TreeEntry[];
    readonly name: string;
    readonly path: string;
}
export type TreeEntry = TreeFileEntry | TreeHiddenEntry | TreeFolderEntry;
/** Play API zip tree.
 *
 * Provides an additional dict-like interface to access PlayFiles in the tree
 * by relative path.
 *
 * Note:
 *   Paths are separated by the POSIX path separator ``/``.
 */
export declare class ZipTree {
    #private;
    readonly hash: string;
    readonly playfile: Record<string, PlayFile>;
    readonly tree: TreeEntry[];
    readonly workno?: string;
    readonly version?: string;
    readonly revision?: string;
    readonly updatedAt?: DateTime;
    constructor(fields: {
        hash: string;
        playfile: Record<string, PlayFile>;
        tree: TreeEntry[];
        workno?: string;
        version?: string;
        revision?: string;
        updatedAt?: DateTime;
    });
    /** Construct a ZipTree from ``ziptree`` JSON data.
  
     * Throws:
     *   DlsiteError: An error occurred.
     */
    static fromJson(data: Record<string, unknown>): ZipTree;
    private get pathsByFile();
    private walk;
    /** Iterate over `[path, playfile]` pairs in the tree. */
    entries(): IterableIterator<[string, PlayFile]>;
    /** Return the PlayFile at the given relative path, if present. */
    get(path: string): PlayFile | undefined;
    /** Number of playfiles reachable in the tree. */
    get size(): number;
    [Symbol.iterator](): IterableIterator<[string, PlayFile]>;
}
/** Ebook Viewer API download token. */
export declare class ViewerToken {
    readonly expireAt: DateTime;
    readonly key: Uint8Array;
    readonly prefix: string;
    readonly keyPairId: string;
    readonly policy: string;
    readonly signature: string;
    readonly d?: string;
    readonly v: string;
    constructor(fields: {
        expireAt: DateTime;
        key: Uint8Array;
        prefix: string;
        keyPairId: string;
        policy: string;
        signature: string;
        d?: string;
        v: string;
    });
    /** Query parameters required by viewer endpoints. */
    get params(): Record<string, string>;
    /** Construct a ViewerToken from JSON response.
  
     * Throws:
     *   DlsiteError: An error occurred.
     */
    static fromJson(data: Record<string, unknown>): ViewerToken;
}
/** CSR viewer API download token. */
export declare class CsrToken {
    readonly cgi: string;
    readonly param: string;
    readonly workno: string;
    readonly customerId: string;
    constructor(fields: {
        cgi: string;
        param: string;
        workno: string;
        customerId: string;
    });
    static fromJson(data: Record<string, unknown>): CsrToken;
}
/** CSR-R viewer API download token. */
export declare class CsrReflowableToken {
    readonly vt: string;
    readonly c: string;
    readonly baseUrl: string;
    readonly accountId: string;
    readonly customerId: string;
    readonly key: Uint8Array;
    constructor(fields: {
        vt: string;
        c: string;
        baseUrl: string;
        accountId: string;
        customerId: string;
        key: Uint8Array;
    });
    static fromJson(data: Record<string, unknown>): CsrReflowableToken;
}
//# sourceMappingURL=models.d.ts.map