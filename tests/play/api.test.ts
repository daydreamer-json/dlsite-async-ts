import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DateTime } from "luxon";

import { FileExistsError } from "../../src/exceptions.js";
import { PlayAPI, parsePurchase } from "../../src/play/api.js";
import { PlayFile } from "../../src/play/models.js";
import {
  bytesResponse,
  jsonResponse,
  mockFetch,
} from "../helpers.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "dlsite-play-test-"));
}

describe("PlayAPI tokens", () => {
  it("fetches a download token", async () => {
    const { fetch } = mockFetch((request) => {
      expect(request.url).toContain("/api/v3/download/sign/cookie");
      expect(request.url.includes("workno=RJ294126")).toBe(true);
      return jsonResponse({
        expires: "2030-01-01T00:00:00+00:00",
        url: "https://play.dl.dlsite.com/content/abc/",
      });
    });
    const api = new PlayAPI(undefined, { fetch });
    const token = await api.downloadToken("RJ294126");
    expect(token.url).toBe("https://play.dl.dlsite.com/content/abc/");
    expect(token.expiration).toBe(
      Math.trunc(DateTime.fromISO("2030-01-01T00:00:00+00:00").toSeconds()),
    );
    await api.close();
  });

  it("parses the ziptree", async () => {
    const { fetch } = mockFetch(() =>
      jsonResponse({
        hash: "h",
        workno: "RJ1",
        playfile: {},
        tree: [{ type: "folder", name: "r", path: "r", children: [] }],
      }),
    );
    const api = new PlayAPI(undefined, { fetch });
    const token = {
      expiresAt: DateTime.now(),
      expiration: 0,
      url: "https://play.dl.dlsite.com/content/abc/",
    };
    const tree = await api.ziptree(token);
    expect(tree.workno).toBe("RJ1");
    expect(tree.size).toBe(0);
    await api.close();
  });
});

describe("PlayAPI.purchases", () => {
  it("yields purchased works with sales dates", async () => {
    const posts: unknown[] = [];
    const { fetch, calls } = mockFetch((request) => {
      if (request.url.includes("/content/count")) {
        return jsonResponse({ user: 2, page_limit: 50, concurrency: 500 });
      }
      if (request.url.includes("/content/sales")) {
        return jsonResponse([
          { workno: "RJ1", sales_date: "2024-01-01T00:00:00+00:00" },
          { workno: "RJ2", sales_date: "2024-02-01T03:04:05+09:00" },
        ]);
      }
      // content/works
      void (async () => {
        posts.push(JSON.parse(await request.text()));
      })();
      return jsonResponse({
        works: [
          purchaseFixture("RJ1"),
          purchaseFixture("RJ2"),
        ],
      });
    });
    const api = new PlayAPI("ja_JP", { fetch });
    const results: Array<[string, string | null]> = [];
    for await (const [work, date] of api.purchases()) {
      results.push([work.productId, date?.toISO()?.slice(0, 10) ?? null]);
    }
    expect(results.map(([id]) => id)).toEqual(["RJ1", "RJ2"]);
    // Sales dates take precedence over per-work dates.
    expect(results[0]?.[1]).toBe("2024-01-01");
    // Batched into one POST of 100 max.
    expect(calls.filter((c) => c.url.href.includes("/content/works"))).toHaveLength(1);
    expect(posts[0] as unknown).toEqual(["RJ1", "RJ2"]);
    await api.close();
  });

  it("maps purchase dictionaries onto Work fields", () => {
    const [work, salesDate] = parsePurchase(purchaseFixture("RJ77"));
    expect(work.productId).toBe("RJ77");
    expect(work.ageCategory).toBe(3);
    expect(work.circle).toBe("サークル七");
    expect(work.brand).toBeUndefined();
    expect(work.makerId).toBe("RG7");
    expect(work.workName).toBe("作品A");
    expect(work.voiceActor).toEqual(["声優X"]);
    expect(work.scenario).toEqual(["シナリオY"]);
    expect(work.workImage).toBe("https://img/main.jpg");
    expect(work.sampleImages).toEqual(["https://img/s1.jpg"]);
    expect(work.registDate?.toISODate()).toBe("2020-05-06");
    expect(salesDate).toBeUndefined();
  });
});

function purchaseFixture(workno: string): Record<string, unknown> {
  return {
    workno,
    site_id: "maniax",
    age_category: "R18",
    name: { ja_JP: "作品A", en_US: "Work A" },
    maker: { id: "RG7", name: { ja_JP: "サークル七" } },
    work_type: "SOU",
    author_name: "作者1/作者2",
    tags: [
      { class: "voice_by", name: "声優X" },
      { class: "scenario_by", name: "シナリオY" },
      { class: "other", name: "無視される" },
    ],
    work_files: { main: "https://img/main.jpg", sub: "https://img/s1.jpg" },
    regist_date: "2020-05-06T07:08:09+00:00",
  };
}

describe("PlayAPI.downloadPlayfile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function playfileWithOptimized(crypt: boolean): PlayFile {
    return PlayFile.fromJson(
      {
        length: 100,
        type: "image",
        image: {
          optimized: {
            crypt,
            width: 256,
            height: 256,
            length: 64,
            name: "abcde0a1b2c3.jpg",
          },
        },
      },
      "hash1",
    );
  }

  it("downloads to destination atomically", async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const { fetch, calls } = mockFetch(() => bytesResponse(payload));
    const api = new PlayAPI(undefined, { fetch });
    const destDir = await makeTempDir();
    const dest = join(destDir, "out.jpg");
    await api.downloadPlayfile(dummyToken(), playfileWithOptimized(false), dest);
    expect(await readFile(dest)).toEqual(Buffer.from(payload));
    expect(calls[0]?.url.href).toContain("optimized/abcde0a1b2c3.jpg");
    await api.close();
  });

  it("raises FileExistsError unless force is set", async () => {
    const { fetch } = mockFetch(() => bytesResponse(new Uint8Array([9])));
    const api = new PlayAPI(undefined, { fetch });
    const destDir = await makeTempDir();
    const dest = join(destDir, "exists.jpg");
    await api.downloadPlayfile(dummyToken(), playfileWithOptimized(false), dest);
    await expect(
      api.downloadPlayfile(dummyToken(), playfileWithOptimized(false), dest),
    ).rejects.toThrow(FileExistsError);
    await api.downloadPlayfile(dummyToken(), playfileWithOptimized(false), dest, { force: true });
    await api.close();
  });

  it("creates parent directories when asked", async () => {
    const { fetch } = mockFetch(() => bytesResponse(new Uint8Array([1])));
    const api = new PlayAPI(undefined, { fetch });
    const base = await makeTempDir();
    const dest = join(base, "a/b/c.jpg");
    await expect(
      api.downloadPlayfile(dummyToken(), playfileWithOptimized(false), dest),
    ).rejects.toThrow(); // ENOENT writing into missing dir
    await api.downloadPlayfile(dummyToken(), playfileWithOptimized(false), dest, { mkdir: true });
    expect(await readFile(dest)).toBeDefined();
    await api.close();
  });

  it("skips files without an optimized version", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetch } = mockFetch(() => {
      throw new Error("should not be called");
    });
    const api = new PlayAPI(undefined, { fetch });
    const destDir = await makeTempDir();
    const playfile = PlayFile.fromJson({ length: 1, type: "video" }, "hv");
    await api.downloadPlayfile(dummyToken(), playfile, join(destDir, "v.mp4"));
    expect(warn).toHaveBeenCalledOnce();
    await api.close();
  });
});

function dummyToken(): { expiresAt: DateTime; expiration: number; url: string } {
  return {
    expiresAt: DateTime.now(),
    expiration: Math.trunc(DateTime.now().toSeconds()),
    url: "https://play.dl.dlsite.com/content/test/",
  };
}
