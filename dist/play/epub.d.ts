/** DLsite Play CSR viewer sessions (fixed-layout and reflowable epubs). */
import { CsrToken, type PlayFile, ZipTree } from "./models.js";
import { type PlayAPI } from "./api.js";
interface PagePart {
    partNo: string;
    scramble: boolean;
}
interface PageInfo {
    pageNo: number;
    totalPartSize: number;
    parts: PagePart[];
    scramble: number[];
}
/** Parsed face.xml content. */
export interface FaceInfo {
    totalPage?: number;
    startPage?: number;
    version?: string;
    scrambleSize?: [number, number];
}
/** Parse a CSR fixed-layout viewer face.xml document. */
export declare function loadFaceXml(content: string): FaceInfo;
/** Parse a CSR fixed-layout viewer page info XML document. */
export declare function loadPageXml(content: string): PageInfo;
/** Options for {@link EpubFixedSession.downloadPage}. */
export interface DownloadCsrPageOptions {
    mkdir?: boolean;
    force?: boolean;
    descramble?: boolean;
    saveOptions?: Record<string, unknown>;
}
/** DLsite Play CSR (fixed-layout epub) Viewer Session. */
export declare class EpubFixedSession implements AsyncDisposable {
    protected readonly play: PlayAPI;
    readonly ziptree: ZipTree;
    readonly playfile: PlayFile;
    readonly workno: string;
    protected token: CsrToken | undefined;
    protected totalPage: number | undefined;
    protected startPage: number | undefined;
    protected version: string | undefined;
    protected scrambleSize: [number, number] | undefined;
    protected wakeUp: number | undefined;
    constructor(playApi: PlayAPI, ziptree: ZipTree, playfile: PlayFile, workno?: string);
    get pageCount(): number;
    get length(): number;
    /** Load the session (viewer auth handshake + face.xml). */
    load(): Promise<void>;
    protected applyFaceInfo(info: FaceInfo): void;
    close(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
    private fetchDownloadToken;
    /**
     * Download one ebook page to the specified directory.
     *
     * Returns downloaded image paths (some pages consist of multiple images).
     *
     * Throws:
     *   FileExistsError: destination file already exists.
     */
    downloadPage(index: number, destDir: string, options?: DownloadCsrPageOptions): Promise<string[]>;
    private fetchPageInfo;
}
/** Descramble a fixed-layout CSR page image in place (requires sharp). */
export declare function descrambleFixedLayout(path: string, scrambleSize: [number, number], scramble: number[], saveOptions?: Record<string, unknown>): Promise<void>;
/**
 * @deprecated Use {@link EpubFixedSession} instead.
 */
export declare class EpubSession extends EpubFixedSession {
}
/** Options for {@link EpubReflowableSession.downloadEpub}. */
export interface DownloadEpubOptions {
    mkdir?: boolean;
    force?: boolean;
}
/** DLsite Play CSR-R (reflowable epub) Viewer Session. */
export declare class EpubReflowableSession implements AsyncDisposable {
    private readonly play;
    readonly ziptree: ZipTree;
    readonly playfile: PlayFile;
    readonly workno: string;
    private token;
    private readonly deobfuscators;
    constructor(playApi: PlayAPI, ziptree: ZipTree, playfile: PlayFile, workno?: string);
    /** Load the session. */
    load(): Promise<void>;
    close(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
    /** Decrypt a buffer with the session key (exposed for testing). */
    testDecrypt(data: Uint8Array, offset?: number): Uint8Array;
    private decrypt;
    private fetchDownloadToken;
    /**
     * Download the reflowable epub to ``destDir/<workno>.epub``.
     *
     * Returns the downloaded file path.
     *
     * Throws:
     *   FileExistsError: destination file already exists.
     */
    downloadEpub(destDir: string, options?: DownloadEpubOptions): Promise<string>;
    private fetchEpubEntry;
    private fetchEpubContents;
    private deobfuscate;
    private deobfuscateImage;
    private deobfuscateText;
}
/**
 * Character-substitution decoder for obfuscated CSR-R XHTML text.
 *
 * Rebuilds the per-seed shuffled kana/kanji tables used by DLsite's
 * text obfuscation.
 */
export declare class Deobfuscator {
    private static readonly HIRAGANA;
    private static readonly KATAKANA;
    private static readonly KANJI;
    private readonly table;
    constructor(seed: number);
    decode(s: string): string;
    private static shuffle;
}
/**
 * Xorshift PRNG matching the DLsite viewer's JS implementation
 * (signed 32-bit semantics are native to JS bitwise operators).
 */
export declare class Xorshift {
    private x;
    private y;
    private z;
    private w;
    private readonly seedUnsigned;
    private primed;
    constructor(seed: number);
    /** Return the next signed 32-bit value. */
    next(): number;
    /** Upstream __call__: seq + abs(next()) % (n + 1 - seq). */
    pick(seq: number, n: number): number;
}
export {};
//# sourceMappingURL=epub.d.ts.map