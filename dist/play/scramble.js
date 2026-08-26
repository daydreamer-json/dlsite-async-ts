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
import { DlsiteError } from "../exceptions.js";
let sharpPromise;
/** Load the optional sharp dependency (the callable default export). */
export function loadSharp() {
    sharpPromise ??= import("sharp").then((m) => m.default);
    return sharpPromise;
}
const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;
/** MT19937 PRNG matching CPython's ``random.Random`` seeded via Knuth's
 * ``init_genrand`` step. */
export class MtRandom {
    constructor(seed) {
        this.mt = [];
        this.index = N + 1;
        this.mt[0] = seed >>> 0;
        for (let i = 1; i < N; i += 1) {
            const prev = this.mt[i - 1];
            this.mt[i] =
                (Math.imul(1812433253, (prev ^ (prev >>> 30)) >>> 0) + i) >>> 0;
        }
        this.index = N;
    }
    /** Direct state-index control (mirrors upstream getstate/setstate usage). */
    getIndex() {
        return this.index;
    }
    setIndex(index) {
        this.index = index;
    }
    twist() {
        for (let i = 0; i < N; i += 1) {
            const y = (this.mt[i] & UPPER_MASK) | (this.mt[(i + 1) % N] & LOWER_MASK);
            this.mt[i] =
                (this.mt[(i + M) % N] ^ (y >>> 1) ^ (y % 2 !== 0 ? MATRIX_A : 0)) >>>
                    0;
        }
        this.index = 0;
    }
    nextUint32() {
        if (this.index >= N) {
            this.twist();
        }
        let y = this.mt[this.index];
        this.index += 1;
        y ^= y >>> 11;
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= y >>> 18;
        return y >>> 0;
    }
    /** CPython ``random.random()`` (53-bit float from two words). */
    random() {
        const a = this.nextUint32() >>> 5;
        const b = this.nextUint32() >>> 6;
        return (a * 67108864 + b) / 9007199254740992;
    }
}
/** Return the Mersenne Twister shuffle mapping used by DLsite Play. */
export function mtTiles(seed, length) {
    if (length > N) {
        throw new RangeError(`length must be <= ${N}`);
    }
    const rs = new MtRandom(seed);
    const a = Array.from({ length }, (_, i) => i);
    let pos = 0;
    for (let n = length - 1; n >= 0; n -= 1) {
        const e = Math.floor(rs.random() * (n + 1));
        const r = a[n];
        a[n] = a[e];
        a[e] = r;
        // (partially) adjust for dlsite's MT implementation: reset the consumed
        // word counter after every draw so only one word per iteration counts.
        pos += 1;
        rs.setIndex(pos);
    }
    return a;
}
async function readTile(sharp, path, left, top, size) {
    return sharp(path)
        .clone()
        .extract({ left, top, width: size, height: size })
        .toBuffer();
}
/** Re-encode `path` in place according to its file extension. */
export function applyOutputFormat(pipeline, path, saveOptions = {}) {
    const extension = path.toLowerCase().replace(/^.*\.(?=[^.]+$)/, "");
    const options = saveOptions;
    switch (extension) {
        case "jpg":
        case "jpeg": {
            return pipeline.jpeg({ quality: 95, ...(options.jpeg ?? {}) });
        }
        case "png": {
            return pipeline.png(options.png ?? {});
        }
        default: {
            return pipeline.webp(options.webp ?? {});
        }
    }
}
/**
 * Descramble the specified image file in place.
 *
 * Requires the optional `sharp` dependency; logs a warning and returns when
 * it is not installed.
 */
export async function descramble(path, playfile, saveOptions = {}) {
    let sharp;
    try {
        sharp = await loadSharp();
    }
    catch {
        console.warn("Image descramble requires installation with sharp (`npm install sharp`)");
        return;
    }
    const optimized = playfile.files["optimized"];
    const width = optimized?.["width"];
    const height = optimized?.["height"];
    if (typeof width !== "number" || typeof height !== "number") {
        throw new DlsiteError("PlayFile optimized entry lacks width/height");
    }
    const tileW = 128;
    const tilesW = Math.ceil(width / tileW);
    const tilesH = Math.ceil(height / tileW);
    const tiles = [];
    for (let y = 0; y < tilesH; y += 1) {
        for (let x = 0; x < tilesW; x += 1) {
            tiles.push(await readTile(sharp, path, x * tileW, y * tileW, tileW));
        }
    }
    const seed = Number.parseInt(playfile.optimizedName.slice(5, 12), 16);
    const order = mtTiles(seed, tiles.length);
    const shuffleMap = new Array(tiles.length);
    order.forEach((target, value) => {
        shuffleMap[target] = value;
    });
    const compositeEntries = tiles.map((_, i) => ({
        input: tiles[shuffleMap[i]],
        left: (i % tilesW) * tileW,
        top: Math.floor(i / tilesW) * tileW,
    }));
    const canvas = sharp({
        create: {
            width: tilesW * tileW,
            height: tilesH * tileW,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
        },
    })
        .composite(compositeEntries)
        // Crop to actual image dimensions (the scrambled image is padded to
        // align to the 128 pixel tile boundary).
        .extract({ left: 0, top: 0, width, height });
    await applyOutputFormat(canvas, path, saveOptions).toFile(path);
}
//# sourceMappingURL=scramble.js.map