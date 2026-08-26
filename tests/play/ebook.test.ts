import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicEncrypt, constants as cryptoConstants, createPublicKey } from "node:crypto";

import { PlayAPI } from "../../src/play/api.js";
import { EbookSession } from "../../src/play/ebook.js";
import { ZipTree } from "../../src/play/models.js";
import { bytesResponse, jsonResponse, mockFetch } from "../helpers.js";

/** The secret viewer key the fake server would share. */
const SECRET_KEY = new Uint8Array([0x0a, 0x1b, 0x2c, 0x3d, 0x4e, 0x5f]);

function xor(data: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    out[i] = (data[i] ?? 0) ^ (key[i % key.length] ?? 0);
  }
  return out;
}

function encryptToBase64(spkiBase64: string, plaintext: string): string {
  const der = Buffer.from(spkiBase64, "base64");
  const keyObject = createPublicKey({ key: der, format: "der", type: "spki" });
  const ciphertext = publicEncrypt(
    {
      key: keyObject,
      padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(plaintext, "utf8"),
  );
  return ciphertext.toString("base64");
}

function makeZiptree(): ZipTree {
  return ZipTree.fromJson({
    hash: "h",
    workno: "RJ1",
    revision: "r9",
    playfile: {
      bookhash: { length: 10, type: "ebook_fixed", ebook_fixed: {} },
    },
    tree: [{ type: "file", name: "book", hashname: "bookhash" }],
  });
}

describe("EbookSession", () => {
  it("performs the RSA-OAEP token exchange and decrypts pages", async () => {
    const ziptree = makeZiptree();
    const playfile = ziptree.get("book");
    expect(playfile).toBeDefined();

    let metaParams = "";
    const { fetch } = mockFetch(async (request) => {
      if (request.method === "POST" && request.url.includes("/viewer/token/RJ1")) {
        const payload = JSON.parse(await request.text()) as Record<string, unknown>;
        expect(payload["play_type"]).toBe("ebook_fixed");
        expect(payload["revision"]).toBe("r9");
        // Encrypt the hex-encoded secret with the posted public key.
        const secretHex = Buffer.from(SECRET_KEY).toString("hex");
        const encrypted = encryptToBase64(
          payload["public_key"] as string,
          secretHex,
        );
        return jsonResponse({
          prefix: "https://cdn.example/pfx",
          expireAt: "2030-01-01T00:00:00+00:00",
          parameters: {
            "Key-Pair-Id": "KID",
            Policy: "POLICY",
            Signature: "SIGNATURE",
          },
          key: encrypted,
        });
      }
      if (request.url.includes("/pfx/bookhash/viewer-meta.json")) {
        metaParams = request.url.split("?")[1] ?? "";
        return jsonResponse({
          page_count: 2,
          meta_data: { title: "Test Book", creator: ["Author A"] },
          pages: [
            { src: "page0.webp", audio: { src: "track0.mp3" } },
            { src: "page1.webp" },
          ],
        });
      }
      if (request.url.includes("/pfx/bookhash/page0.webp")) {
        return bytesResponse(xor(new Uint8Array([10, 20, 30, 40]), SECRET_KEY));
      }
      if (request.url.includes("/pfx/bookhash/track0.mp3")) {
        return bytesResponse(new Uint8Array([77, 88]));
      }
      throw new Error(`Unexpected URL ${request.url}`);
    });

    const api = new PlayAPI(undefined, { fetch });
    const session = new EbookSession(api, ziptree, playfile!);
    await session.load();
    expect(session.title).toBe("Test Book");
    expect(session.creators).toEqual(["Author A"]);
    expect(session.pageCount).toBe(2);
    expect(metaParams).toContain("Policy=POLICY");

    const destDir = await mkdtemp(join(tmpdir(), "ebook-test-"));
    const written = await session.downloadPage(0, destDir);
    expect(written).toHaveLength(2);
    expect(await readFile(join(destDir, "page0.webp"))).toEqual(
      Buffer.from([10, 20, 30, 40]),
    );
    expect(await readFile(join(destDir, "track0.mp3"))).toEqual(
      Buffer.from([77, 88]),
    );

    await expect(session.downloadPage(99, destDir)).rejects.toThrow(
      "Invalid page number",
    );

    await session.close();
    await api.close();
  });
});
