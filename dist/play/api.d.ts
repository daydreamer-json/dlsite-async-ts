/** DLsite Play API classes. */
import { DateTime } from "luxon";
import { BaseAPI, type BaseAPIOptions } from "../api.js";
import { Work } from "../work.js";
import { DownloadToken, PlayFile, ZipTree } from "./models.js";
/** DLsite Play API session. */
export declare class PlayAPI extends BaseAPI {
    /** Optional locale (e.g. ``ja_JP``). */
    readonly locale: string | undefined;
    constructor(locale?: string, options?: BaseAPIOptions);
    /** Login to DLsite Play. */
    login(loginId?: string, password?: string, netrcHost?: string): Promise<void>;
    /** Return a download token for the specified workno. */
    downloadToken(workno: string): Promise<DownloadToken>;
    /** Return ziptree for the specified download. */
    ziptree(token: DownloadToken): Promise<ZipTree>;
    /** Download a playfile to the specified location.
     *
     * Throws:
     *   FileExistsError: ``dest`` already exists.
     */
    downloadPlayfile(token: DownloadToken, playfile: PlayFile, dest: string, options?: DownloadPlayfileOptions): Promise<void>;
    /**
     * Iterate over purchased works.
     *
     * Yields tuples of the purchased work and its purchase date. Purchases are
     * requested in batches of 100 and yielded per batch; they are not
     * guaranteed to be in historical order.
     */
    purchases(last?: DateTime): AsyncGenerator<[Work, DateTime | undefined]>;
    private getProductCount;
    private getProductSales;
}
/** Options for {@link PlayAPI.downloadPlayfile}. */
export interface DownloadPlayfileOptions {
    /** Create parent directories of ``dest`` when missing. */
    mkdir?: boolean;
    /** Overwrite ``dest`` when it already exists. */
    force?: boolean;
    /** Descramble downloaded images (requires `sharp`). */
    descramble?: boolean;
    /** Additional sharp save options applied when descrambling. */
    saveOptions?: Record<string, unknown>;
}
/** Long timeout used for large downloads. */
export declare const DL_TIMEOUT_MS: number;
/** Construct a Work from a purchases API dictionary. */
export declare function parsePurchase(raw: Record<string, unknown>, locale?: string): [Work, DateTime | undefined];
//# sourceMappingURL=api.d.ts.map