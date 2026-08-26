/**
 * DLsite Play image scrambling module.
 *
 * DLsite play ``crypt`` function slices image into 128x128px tiles and then
 * shuffles them so that any image retrieved from the web server appears
 * scrambled. Restoring the original image requires putting the tiles back
 * into the correct order.
 *
 * Images are shuffled using a Mersenne Twister PRNG with a known seed (see
 * image viewer ``main.js``).
 */
import type { PlayFile } from "./models.js";
type SharpFactory = typeof import("sharp")["default"];
/** Load the optional sharp dependency (the callable default export). */
export declare function loadSharp(): Promise<SharpFactory>;
/** MT19937 PRNG matching CPython's ``random.Random`` seeded via Knuth's
 * ``init_genrand`` step. */
export declare class MtRandom {
    private readonly mt;
    private index;
    constructor(seed: number);
    /** Direct state-index control (mirrors upstream getstate/setstate usage). */
    getIndex(): number;
    setIndex(index: number): void;
    private twist;
    nextUint32(): number;
    /** CPython ``random.random()`` (53-bit float from two words). */
    random(): number;
}
/** Return the Mersenne Twister shuffle mapping used by DLsite Play. */
export declare function mtTiles(seed: number, length: number): number[];
/** Re-encode `path` in place according to its file extension. */
export declare function applyOutputFormat(pipeline: ReturnType<SharpFactory>, path: string, saveOptions?: Record<string, unknown>): ReturnType<SharpFactory>;
/**
 * Descramble the specified image file in place.
 *
 * Requires the optional `sharp` dependency; logs a warning and returns when
 * it is not installed.
 */
export declare function descramble(path: string, playfile: PlayFile, saveOptions?: Record<string, unknown>): Promise<void>;
export {};
//# sourceMappingURL=scramble.d.ts.map