/** DLsite Play ebook viewer. */
import type { PlayFile, ZipTree } from "./models.js";
import { type PlayAPI } from "./api.js";
/** Options for {@link EbookSession.downloadPage}. */
export interface DownloadPageOptions {
    /** Create ``destDir`` and parent directories when missing. */
    mkdir?: boolean;
    /** Overwrite existing destination files. */
    force?: boolean;
    /** Download audio for the page when present (default true). */
    audio?: boolean;
    /** Download the image for the page (default true). */
    image?: boolean;
    /** Convert downloaded images to this format (requires `sharp`). */
    convert?: "jpg" | "png";
    /** Additional sharp save options applied when converting. */
    saveOptions?: Record<string, unknown>;
}
/** DLsite Play Ebook Viewer Session. */
export declare class EbookSession implements AsyncDisposable {
    #private;
    private readonly play;
    readonly ziptree: ZipTree;
    readonly playfile: PlayFile;
    readonly workno: string;
    constructor(playApi: PlayAPI, ziptree: ZipTree, playfile: PlayFile, workno?: string);
    private metaData;
    private pages;
    get title(): string;
    get creators(): string[];
    get pageCount(): number;
    get length(): number;
    /** Load the session token and viewer metadata. */
    load(): Promise<void>;
    close(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
    private fetchDownloadToken;
    private fetchMeta;
    /**
     * Download one ebook page to the specified directory.
     *
     * Returns downloaded file paths.
     *
     * Throws:
     *   FileExistsError: destination file already exists.
     */
    downloadPage(index: number, destDir: string, options?: DownloadPageOptions): Promise<string[]>;
}
//# sourceMappingURL=ebook.d.ts.map