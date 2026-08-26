import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicEncrypt, constants as cryptoConstants, createPublicKey } from "node:crypto";
import { unzipSync } from "fflate";

import { PlayAPI } from "../../src/play/api.js";
import {
  EpubFixedSession,
  EpubReflowableSession,
} from "../../src/play/epub.js";
import { ZipTree } from "../../src/play/models.js";
import { bytesResponse, jsonResponse } from "../helpers.js";

const SECRET_KEY = new Uint8Array([
  0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33,
]);

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

function mockFetchHandler(
  handler: (url: string) => Response | Promise<Response>,
): { fetch: typeof globalThis.fetch } {
  const f: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    return handler(request.url);
  };
  return { fetch: f };
}

describe("EpubFixedSession", () => {
  function fixedZiptree(): ZipTree {
    return ZipTree.fromJson({
      hash: "h",
      workno: "BJ1",
      playfile: {
        epubhash: { length: 10, type: "epub", epub: {} },
      },
      tree: [{ type: "file", name: "book", hashname: "epubhash" }],
    });
  }

  const FACE_XML = `<?xml version="1.0"?><Info><TotalPage>2</TotalPage>` +
    `<StartPage>0</StartPage><Version>1.2.3</Version>` +
    `<Scramble><Width>2</Width><Height>2</Height></Scramble></Info>`;

  it("loads face.xml and downloads pages", async () => {
    const ziptree = fixedZiptree();
    const playfile = ziptree.get("book")!;
    const seenUrls: string[] = [];
    const { fetch } = mockFetchHandler((url) => {
      if (url.includes("/api/v3/csr/token")) {
        return jsonResponse({
          values: {
            cgi: "https://cgi.example/viewer",
            param: "PARAM",
            workno: "BJ1",
            customer_id: "42",
          },
        });
      }
      if (url.startsWith("https://cgi.example/viewer")) {
        seenUrls.push(url);
        if (url.includes("mode=999")) {
          return new Response("");
        }
        if (url.includes("extend_info.json")) {
          return new Response("", { status: 404 });
        }
        if (url.includes("face.xml")) {
          return new Response(FACE_XML);
        }
        if (url.includes("0000.xml")) {
          return new Response(
            `<Page><PageNo>1</PageNo><TotalPartSize>100</TotalPartSize>` +
              `<Part><Kind No="0000" scramble="0"/></Part></Page>`,
          );
        }
        if (url.includes("0000_0000.bin")) {
          return bytesResponse(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]));
        }
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const api = new PlayAPI(undefined, { fetch: fetch });
    const session = new EpubFixedSession(api, ziptree, playfile);
    await session.load();
    expect(session.pageCount).toBe(2);

    // Auth handshake order: auth key -> extend info -> face xml.
    expect(seenUrls[0]).toContain("mode=999");
    expect(seenUrls[1]).toContain("extend_info.json");
    expect(seenUrls[2]).toContain("face.xml");

    const destDir = await mkdtemp(join(tmpdir(), "csr-test-"));
    const files = await session.downloadPage(0, destDir);
    expect(files).toEqual([join(destDir, "0000.jpg")]);
    expect(await readFile(files[0]!)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]),
    );

    await expect(session.downloadPage(5, destDir)).rejects.toThrow(
      "Invalid page number",
    );
    await session.close();
    await api.close();
  });
});

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

function opfXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <manifest>
    <item id="chap" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="img" href="images/img.png" media-type="image/png"/>
  </manifest>
</package>`;
}

// Candidate characters for reverse-looking-up obfuscated mappings.
const CANDIDATE_CHARS =
  "あいうえおかがきぎくぐけげこごさざしじすずせぜそぞただちぢつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもやゆよらりるれろわゐゑをんゔ" +
  "アイウエオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモヤユヨラリルレロワヰヱヲンヴヷヸヹヺ";

describe("EpubReflowableSession", () => {
  it("downloads and assembles a decrypted epub", async () => {
    // Build the obfuscated xhtml content.
    const { Deobfuscator } = await import("../../src/play/epub.js");
    const decoder = new Deobfuscator(0);
    let obfuscated = "";
    for (const candidate of CANDIDATE_CHARS) {
      if (decoder.decode(candidate) === "あ") {
        obfuscated = candidate;
        break;
      }
    }
    expect(obfuscated).not.toBe("");
    const rawXhtml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<html xmlns="http://www.w3.org/1999/xhtml"><body>` +
      `<p><span data-ofs="0">${obfuscated}</span></p></body></html>`;

    const pngMagic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
    const entries: Record<string, Uint8Array> = {
      mimetype: new TextEncoder().encode("application/epub+zip"),
      "preprocess-settings.json": new TextEncoder().encode(
        JSON.stringify({
          obfuscateText: true,
          obfuscateImage: false,
          obfuscateImageKey: 42,
        }),
      ),
      "META-INF/container.xml": new TextEncoder().encode(CONTAINER_XML),
      "OEBPS/content.opf": new TextEncoder().encode(opfXml()),
      "OEBPS/chapter.xhtml": new TextEncoder().encode(rawXhtml),
      "OEBPS/images/img.png": pngMagic,
    };

    const { fetch } = mockFetchHandler(async (url) => {
      if (url.includes("/api/v3/csr/reflowable/token")) {
        const request = lastPostRequest;
        if (request === null) {
          throw new Error("missing post");
        }
        const payload = JSON.parse(await request.text()) as Record<string, unknown>;
        expect(payload["play_type"]).toBe("epub_reflowable");
        const secretHex = Buffer.from(SECRET_KEY).toString("hex");
        return jsonResponse({
          values: {
            vt: "VIEWTOKEN123",
            c: "C",
            base_url: "https://cdn-r.example/work",
            account_id: "ACC",
            customer_id: "7",
            key: encryptToBase64(payload["public_key"] as string, secretHex),
          },
        });
      }
      if (url.startsWith("https://cdn-r.example/work/")) {
        const arcname = decodeURIComponent(
          url.replace("https://cdn-r.example/work/", ""),
        );
        const data = entries[arcname];
        if (data === undefined) {
          return new Response("", { status: 404 });
        }
        return bytesResponse(xor(data, SECRET_KEY));
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    let lastPostRequest: Request | null = null;
    const wrappedFetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "POST") {
        lastPostRequest = request.clone();
      }
      return fetch(request);
    };

    const api = new PlayAPI(undefined, { fetch: wrappedFetch });
    const ziptree = ZipTree.fromJson({
      hash: "h",
      workno: "BJ9",
      playfile: {
        refhash: { length: 10, type: "epub_reflowable", epub_reflowable: {} },
      },
      tree: [{ type: "file", name: "book", hashname: "refhash" }],
    });
    const session = new EpubReflowableSession(api, ziptree, ziptree.get("book")!);
    await session.load();

    // Sanity: session decrypt matches our xor helper.
    expect(session.testDecrypt(xor(new Uint8Array([1, 2]), SECRET_KEY))).toEqual(
      new Uint8Array([1, 2]),
    );

    const destDir = await mkdtemp(join(tmpdir(), "csrr-test-"));
    const dest = await session.downloadEpub(destDir, { mkdir: true });
    expect(dest.endsWith("BJ9.epub")).toBe(true);

    const archive = await readFile(dest);
    const unzipped = unzipSync(new Uint8Array(archive));
    expect(Buffer.from(unzipped["mimetype"]!).toString()).toBe(
      "application/epub+zip",
    );
    expect(Buffer.from(unzipped["META-INF/container.xml"]!).toString()).toBe(
      CONTAINER_XML,
    );
    const chapter = Buffer.from(unzipped["OEBPS/chapter.xhtml"]!).toString();
    // cheerio's XML serializer escapes non-ASCII characters as entities.
    expect(chapter).toContain("&#x3042;");
    expect(chapter).not.toContain(obfuscated);
    expect(unzipped["OEBPS/images/img.png"]).toEqual(pngMagic);

    await session.close();
    await api.close();
  });
});
