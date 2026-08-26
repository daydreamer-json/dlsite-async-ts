import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import { DlsiteError } from "../../src/exceptions.js";
import {
  CsrReflowableToken,
  CsrToken,
  DownloadToken,
  PlayFile,
  ViewerToken,
  ZipTree,
} from "../../src/play/models.js";

describe("DownloadToken", () => {
  it("parses expires and url", () => {
    const token = DownloadToken.fromJson({
      expires: "2030-01-01T00:00:00+00:00",
      url: "https://play.dl.dlsite.com/content/abc/",
    });
    expect(token.url).toBe("https://play.dl.dlsite.com/content/abc/");
    expect(token.expiration).toBe(
      Math.trunc(DateTime.fromISO("2030-01-01T00:00:00+00:00").toSeconds()),
    );
  });

  it("rejects malformed data", () => {
    expect(() => DownloadToken.fromJson({})).toThrow(DlsiteError);
  });
});

describe("PlayFile", () => {
  it("computes human readable sizes", () => {
    const make = (length: number): PlayFile =>
      PlayFile.fromJson({ length, type: "text" }, "h");
    expect(make(4006).size).toBe("3.9KB");
    expect(make(5193978).size).toBe("5.0MB");
    expect(make(500).size).toBe("500.0B");
    expect(make(2_000_000_000).size).toBe("1.9GB");
  });

  it("exposes optimized accessors", () => {
    const playfile = PlayFile.fromJson(
      {
        length: 1394068,
        type: "image",
        image: {
          files: {
            crypt: false,
            height: 3000,
            length: 1394068,
            name: "orig.jpg",
          },
          optimized: {
            crypt: true,
            height: 1280,
            length: 220746,
            name: "opt.jpg",
            width: 914,
          },
        },
      },
      "hash",
    );
    expect(playfile.optimizedName).toBe("opt.jpg");
    expect(playfile.optimizedLength).toBe(220746);
    expect(playfile.isEbook).toBe(false);
    expect(playfile.isEpubFixed).toBe(false);
  });

  it("throws when no optimized file exists", () => {
    const playfile = PlayFile.fromJson({ length: 1, type: "video" }, "h");
    expect(() => playfile.optimizedName).toThrow(DlsiteError);
    expect(() => playfile.optimizedLength).toThrow(DlsiteError);
  });

  it.each([
    ["ebook_fixed", true],
    ["ebook_voicecomic", true],
    ["ebook_webtoon", true],
    ["voicecomic_v2", true],
    ["epub", false],
    ["image", false],
  ])("isEbook for %s is %s", (type, expected) => {
    expect(PlayFile.fromJson({ length: 0, type }, "h").isEbook).toBe(expected);
  });

  it.each([
    ["epub", "isEpubFixed", true],
    ["epub_reflowable", "isEpubReflowable", true],
    ["epub", "isEpubReflowable", false],
    ["epub", "isEpub", true],
  ] as const)("type flags %s %s = %s", (type, prop, expected) => {
    const playfile = PlayFile.fromJson({ length: 0, type }, "h");
    expect(playfile[prop]).toBe(expected);
  });
});

describe("ZipTree", () => {
  const fixture = {
    hash: "deadbeef",
    workno: "RJ294126",
    version: "1.0",
    revision: "2",
    updated_at: "2024-01-02 03:04:05",
    playfile: {
      h_txt: {
        length: 4006,
        type: "text",
        text: { optimized: { name: "a.txt", length: 100 } },
      },
      h_img: {
        length: 1394068,
        type: "image",
        optimized: { name: "b.jpg", length: 200 },
      },
    },
    tree: [
      {
        type: "folder",
        name: "root",
        path: "root",
        children: [
          { type: "file", name: "readme.txt", hashname: "h_txt" },
          { type: "hidden", name: ".hidden.jpg", hashname: "h_img" },
          {
            type: "folder",
            name: "sub",
            path: "root/sub",
            children: [],
          },
        ],
      },
    ],
  };

  it("parses and walks the tree", () => {
    const tree = ZipTree.fromJson(fixture);
    expect(tree.hash).toBe("deadbeef");
    expect(tree.workno).toBe("RJ294126");
    expect(tree.revision).toBe("2");
    expect(tree.updatedAt?.toISODate()).toBe("2024-01-02");
    const entries = Object.fromEntries(tree.entries());
    expect(Object.keys(entries).sort()).toEqual([
      "root/.hidden.jpg",
      "root/readme.txt",
    ]);
    expect(entries["root/readme.txt"]?.optimizedName).toBe("a.txt");
    expect(entries["root/readme.txt"]?.hashname).toBe("h_txt");
    expect(tree.size).toBe(2);
    expect(tree.get("root/readme.txt")).toBeDefined();
    expect(tree.get("missing")).toBeUndefined();
  });

  it("rejects unknown entry types", () => {
    expect(() =>
      ZipTree.fromJson({
        hash: "x",
        tree: [{ type: "mystery", name: "?" }],
      }),
    ).toThrow(DlsiteError);
  });
});

describe("ViewerToken", () => {
  const keyBytes = new Uint8Array([1, 2, 3, 4, 5]);

  it("builds viewer params", () => {
    const token = new ViewerToken({
      expireAt: DateTime.fromISO("2030-01-01T00:00:00Z"),
      key: keyBytes,
      prefix: "https://cdn.example/prefix",
      keyPairId: "KID",
      policy: "POL",
      signature: "SIG",
      d: "DDD",
      v: "v1",
    });
    expect(token.params).toEqual({
      Policy: "POL",
      Signature: "SIG",
      "Key-Pair-Id": "KID",
      d: "DDD",
      v: "v1",
    });
  });

  it("omits missing d param", () => {
    const token = new ViewerToken({
      expireAt: DateTime.fromISO("2030-01-01T00:00:00Z"),
      key: keyBytes,
      prefix: "p",
      keyPairId: "KID",
      policy: "POL",
      signature: "SIG",
      v: "",
    });
    expect(token.params["d"]).toBeUndefined();
  });

  it("parses json with parameters block", () => {
    const token = ViewerToken.fromJson({
      expireAt: "2030-01-01T00:00:00+00:00",
      prefix: "pre",
      key: keyBytes,
      parameters: {
        "Key-Pair-Id": "KID",
        Policy: "POL",
        Signature: "SIG",
      },
      v: "rev",
    });
    expect(token.keyPairId).toBe("KID");
    expect(token.v).toBe("rev");
    expect([...token.key]).toEqual([1, 2, 3, 4, 5]);
    expect(() => ViewerToken.fromJson({})).toThrow(DlsiteError);
  });
});

describe("CSR tokens", () => {
  it("parses CSRToken snake_case values", () => {
    const token = CsrToken.fromJson({
      cgi: "https://csr.example/cgi",
      param: "P",
      workno: "BJ1",
      customer_id: "42",
    });
    expect(token.customerId).toBe("42");
    expect(CsrToken.fromJson.bind(null, {})).toThrow();
  });

  it("parses CsrReflowableToken with key bytes", () => {
    const token = CsrReflowableToken.fromJson({
      vt: "VT",
      c: "C",
      base_url: "https://cdn.example/",
      account_id: "A",
      customer_id: "42",
      key: new Uint8Array([9, 8]),
    });
    expect(token.baseUrl).toBe("https://cdn.example/");
    expect([...token.key]).toEqual([9, 8]);
  });
});
