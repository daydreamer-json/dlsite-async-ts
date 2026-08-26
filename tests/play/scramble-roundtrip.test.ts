import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { PlayFile } from "../../src/play/models.js";
import { descramble, mtTiles } from "../../src/play/scramble.js";

const TILE = 128;
/** 2x2 grid of tiles, each filled with a distinct solid color. */
const WIDTH = TILE * 2;
const HEIGHT = TILE * 2;
const CHANNELS = 3;

async function makeOriginalImage(): Promise<Buffer> {
  const colors = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];
  const raw = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const tile = Math.floor(y / TILE) * 2 + Math.floor(x / TILE);
      const [r = 0, g = 0, b = 0] = colors[tile]!;
      const offset = (y * WIDTH + x) * CHANNELS;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }
  return sharp(raw, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } })
    .png()
    .toBuffer();
}

describe("descramble roundtrip", () => {
  it("restores the original tile order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scramble-test-"));
    const path = join(dir, "image.jpg");

    // DLsite derives the PRNG seed from characters 5..11 of the file name.
    const optimizedName = "aaaaa1a2b3c4.jpg";
    const imageSeed = Number.parseInt(optimizedName.slice(5, 12), 16);
    expect(imageSeed).toBe(Number.parseInt("1a2b3c4", 16));

    // Build a scrambled image exactly like DLsite's server-side crypt:
    // original tile t is placed at scrambled position shuffle[t].
    const order = mtTiles(imageSeed, 4);
    const shuffleMap = new Array<number>(4);
    order.forEach((target, value) => {
      shuffleMap[target] = value;
    });

    const original = await makeOriginalImage();
    const originalRaw = await sharp(original).raw().toBuffer();
    const scrambledRaw = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
    for (let src = 0; src < 4; src += 1) {
      const dst = shuffleMap[src]!;
      const sx = (src % 2) * TILE;
      const sy = Math.floor(src / 2) * TILE;
      const dx = (dst % 2) * TILE;
      const dy = Math.floor(dst / 2) * TILE;
      for (let y = 0; y < TILE; y += 1) {
        const srcStart = ((sy + y) * WIDTH + sx) * CHANNELS;
        const dstStart = ((dy + y) * WIDTH + dx) * CHANNELS;
        scrambledRaw.set(
          originalRaw.subarray(srcStart, srcStart + TILE * CHANNELS),
          dstStart,
        );
      }
    }
    const scrambled = await sharp(scrambledRaw, {
      raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    await writeFile(path, scrambled);

    const playfile = PlayFile.fromJson(
      {
        length: scrambled.length,
        type: "image",
        image: {
          optimized: {
            crypt: true,
            width: WIDTH,
            height: HEIGHT,
            length: scrambled.length,
            name: optimizedName,
          },
        },
      },
      "h",
    );

    await descramble(path, playfile);

    // Compare the average color of each restored tile against the original
    // solid colors (robust against JPEG boundary artifacts).
    const restored = await sharp(await readFile(path)).raw().toBuffer();
    const tileAverage = (buf: Buffer, tx: number, ty: number): number[] => {
      const sums: [number, number, number] = [0, 0, 0];
      const count = TILE * TILE;
      for (let y = 0; y < TILE; y += 1) {
        for (let x = 0; x < TILE; x += 1) {
          const offset = ((ty * TILE + y) * WIDTH + (tx * TILE + x)) * CHANNELS;
          sums[0] += buf[offset]!;
          sums[1] += buf[offset + 1]!;
          sums[2] += buf[offset + 2]!;
        }
      }
      return sums.map((s) => s / count);
    };
    const originalColors: Array<[number, number, number]> = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
    ];
    for (let tile = 0; tile < 4; tile += 1) {
      const avg = tileAverage(restored, tile % 2, Math.floor(tile / 2));
      const expected = originalColors[tile]!;
      for (let c = 0; c < CHANNELS; c += 1) {
        expect(Math.abs(avg[c]! - expected[c]!)).toBeLessThan(6);
      }
    }
  });
});
