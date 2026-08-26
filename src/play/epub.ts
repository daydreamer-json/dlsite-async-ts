/** DLsite Play CSR viewer sessions (fixed-layout and reflowable epubs). */

import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  unlink,
  utimes,
} from "node:fs/promises";
import os from "node:os";
import * as posix from "node:path";
import * as cheerio from "cheerio";
import { HTTPError } from "ky";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

import { DlsiteError, FileExistsError } from "../exceptions.js";
import {
  base64ToBytes,
  generateRsaKeyPair,
  hexToBytes,
  rsaOaepDecrypt,
  spkiBase64,
} from "../encoding.js";
import { pathExists, streamToFile, xorBytes } from "../stream.js";
import {
  CsrReflowableToken,
  CsrToken,
  type PlayFile,
  ZipTree,
} from "./models.js";
import { loadSharp } from "./scramble.js";
import { DL_TIMEOUT_MS, type PlayAPI } from "./api.js";

const Mode = {
  DL_XML: 0,
  DL_JPEG: 1,
  DL_FACE_XML: 7,
  DL_PAGE_XML: 8,
  DL_AUTH_KEY: 999,
} as const;

const RequestType = {
  FILE: 0,
  AUTH_FIRST: 1,
} as const;

const ViewMode = {
  KOMA: 1,
  VERTICAL: 2,
  HYBRID: 4,
} as const;

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

interface PreprocessSettings {
  obfuscateText: boolean;
  obfuscateImage: boolean;
  obfuscateImageKey?: number;
}

function preprocessSettingsFromJson(
  data: Record<string, unknown>,
): PreprocessSettings {
  const key = data["obfuscateImageKey"];
  return {
    obfuscateText: data["obfuscateText"] === true,
    obfuscateImage: data["obfuscateImage"] === true,
    ...(typeof key === "number" ? { obfuscateImageKey: key } : {}),
  };
}

/** Parsed face.xml content. */
export interface FaceInfo {
  totalPage?: number;
  startPage?: number;
  version?: string;
  scrambleSize?: [number, number];
}

/** Parse a CSR fixed-layout viewer face.xml document. */
export function loadFaceXml(content: string): FaceInfo {
  const $ = cheerio.load(content, { xmlMode: true });
  const info: FaceInfo = {};
  const totalPage = Number.parseInt($("TotalPage").first().text(), 10);
  if (!Number.isNaN(totalPage)) {
    info.totalPage = totalPage;
  }
  const startPage = Number.parseInt($("StartPage").first().text(), 10);
  if (!Number.isNaN(startPage)) {
    info.startPage = startPage;
  }
  const version = $("Version").first().text();
  if (version !== "") {
    info.version = version;
  }
  const width = Number.parseInt($("Scramble > Width").first().text(), 10);
  const height = Number.parseInt($("Scramble > Height").first().text(), 10);
  if (!Number.isNaN(width) && !Number.isNaN(height)) {
    info.scrambleSize = [width, height];
  }
  return info;
}

/** Parse a CSR fixed-layout viewer page info XML document. */
export function loadPageXml(content: string): PageInfo {
  const $ = cheerio.load(content, { xmlMode: true });
  const pageNo = Number.parseInt($("PageNo").first().text(), 10);
  const totalPartSize = Number.parseInt($("TotalPartSize").first().text(), 10);
  if (Number.isNaN(pageNo) || Number.isNaN(totalPartSize)) {
    throw new DlsiteError("Unexpected CSR viewer page data");
  }
  const part = $("Part").first();
  if (part.length === 0) {
    throw new DlsiteError("Unexpected CSR viewer page data");
  }
  const parts: PagePart[] = [];
  part.find("Kind").each((_i, kind) => {
    parts.push({
      partNo: $(kind).attr("No") ?? "0000",
      scramble: (Number.parseInt($(kind).attr("scramble") ?? "0", 10) || 0) !== 0,
    });
  });
  const scrambleText = $("Scramble").first().text();
  const scramble =
    scrambleText.trim() !== ""
      ? scrambleText
          .split(",")
          .map((x) => Number.parseInt(x.trim(), 10))
          .filter((x) => !Number.isNaN(x))
      : [];
  return { pageNo, totalPartSize, parts, scramble };
}

/** Result of downloading a single epub entry into the temp dir. */
interface EpubEntry {
  /** Absolute filesystem path inside the temp dir. */
  path: string;
  /** Archive-relative POSIX arcname. */
  arcname: string;
  mtime?: Date;
  /** Hint to deflate the entry instead of storing it. */
  deflateHint?: boolean;
}

/** Options for {@link EpubFixedSession.downloadPage}. */
export interface DownloadCsrPageOptions {
  mkdir?: boolean;
  force?: boolean;
  descramble?: boolean;
  saveOptions?: Record<string, unknown>;
}

/** DLsite Play CSR (fixed-layout epub) Viewer Session. */
export class EpubFixedSession implements AsyncDisposable {
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

  constructor(
    playApi: PlayAPI,
    ziptree: ZipTree,
    playfile: PlayFile,
    workno?: string,
  ) {
    this.play = playApi;
    this.ziptree = ziptree;
    this.playfile = playfile;
    const resolvedWorkno = workno ?? ziptree.workno;
    if (resolvedWorkno === undefined || resolvedWorkno === "") {
      throw new Error("workno must be specified");
    }
    this.workno = resolvedWorkno;
    if (!playfile.isEpubFixed) {
      throw new Error(`Unsupported epub type: ${playfile.type}`);
    }
  }

  get pageCount(): number {
    return this.totalPage ?? 0;
  }

  get length(): number {
    return this.pageCount;
  }

  /** Load the session (viewer auth handshake + face.xml). */
  async load(): Promise<void> {
    if (this.token === undefined) {
      this.token = await this.fetchDownloadToken();
    }
    if (
      this.totalPage === undefined ||
      this.startPage === undefined ||
      this.version === undefined ||
      this.scrambleSize === undefined
    ) {
      const token = this.token;
      this.wakeUp = Date.now() % 10_000_000;
      const params: Record<string, string | number> = {
        mode: Mode.DL_AUTH_KEY,
        file: "",
        reqtype: RequestType.AUTH_FIRST,
        vm: ViewMode.HYBRID,
        param: token.param,
        time: this.wakeUp,
      };
      await this.play.get(token.cgi, { searchParams: params });

      params["mode"] = Mode.DL_JPEG;
      params["file"] = "extend_info.json";
      params["reqtype"] = RequestType.FILE;
      // This request 404's for most works but is performed to match the
      // viewer auth -> face xml request flow.
      await this.play.get(token.cgi, {
        searchParams: params,
        throwHttpErrors: false,
      });

      params["mode"] = Mode.DL_FACE_XML;
      params["file"] = "face.xml";
      const response = await this.play.get(token.cgi, { searchParams: params });
      this.applyFaceInfo(loadFaceXml(await response.text()));
    }
  }

  protected applyFaceInfo(info: FaceInfo): void {
    if (info.totalPage !== undefined) {
      this.totalPage = info.totalPage;
    }
    if (info.startPage !== undefined) {
      this.startPage = info.startPage;
    }
    if (info.version !== undefined) {
      this.version = info.version;
    }
    if (info.scrambleSize !== undefined) {
      this.scrambleSize = info.scrambleSize;
    }
  }

  async close(): Promise<void> {
    this.token = undefined;
    this.totalPage = undefined;
    this.startPage = undefined;
    this.version = undefined;
    this.scrambleSize = undefined;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  private async fetchDownloadToken(): Promise<CsrToken> {
    const url = "https://play.dlsite.com/api/v3/csr/token";
    const response = await this.play.get(url, {
      searchParams: {
        workno: this.workno,
        hashname: this.playfile.hashname || "",
        layout: "fixed",
      },
    });
    const data = (await response.json()) as Record<string, unknown>;
    const values = data["values"];
    if (values === null || typeof values !== "object") {
      throw new DlsiteError("Got unexpected csr token data.");
    }
    return CsrToken.fromJson(values as Record<string, unknown>);
  }

  /**
   * Download one ebook page to the specified directory.
   *
   * Returns downloaded image paths (some pages consist of multiple images).
   *
   * Throws:
   *   FileExistsError: destination file already exists.
   */
  async downloadPage(
    index: number,
    destDir: string,
    options: DownloadCsrPageOptions = {},
  ): Promise<string[]> {
    const token = this.token;
    if (token === undefined) {
      throw new DlsiteError("CSR session has not been loaded");
    }
    const pageInfo = await this.fetchPageInfo(index);
    const results: string[] = [];
    for (const part of pageInfo.parts) {
      const indexStem = String(index).padStart(4, "0");
      const partStem = `${indexStem}_${part.partNo}`;
      const filename =
        pageInfo.parts.length === 1 ? `${indexStem}.jpg` : `${partStem}.jpg`;
      const dest = posix.join(destDir, ...filename.split("/"));
      const parent = posix.dirname(dest);
      if (options.mkdir === true && !(await pathExists(parent))) {
        await mkdir(parent, { recursive: true });
      }
      if (options.force !== true && (await pathExists(dest))) {
        throw new FileExistsError(dest);
      }
      const response = await this.play.get(token.cgi, {
        searchParams: {
          mode: Mode.DL_JPEG,
          file: `${partStem}.bin`,
          reqtype: RequestType.FILE,
          vm: ViewMode.HYBRID,
          param: token.param,
          time: this.wakeUp ?? 0,
        },
        timeout: DL_TIMEOUT_MS,
      });
      await streamToFile(response, dest);
      if (
        options.descramble === true &&
        part.scramble &&
        this.scrambleSize !== undefined
      ) {
        await descrambleFixedLayout(
          dest,
          this.scrambleSize,
          pageInfo.scramble,
          options.saveOptions ?? {},
        );
      }
      results.push(dest);
    }
    return results;
  }

  private async fetchPageInfo(index: number): Promise<PageInfo> {
    const token = this.token;
    if (token === undefined || this.totalPage === undefined) {
      throw new DlsiteError("CSR session has not been loaded");
    }
    if (index >= this.totalPage) {
      throw new Error("Invalid page number");
    }
    const response = await this.play.get(token.cgi, {
      searchParams: {
        mode: Mode.DL_PAGE_XML,
        file: `${String(index).padStart(4, "0")}.xml`,
        reqtype: RequestType.FILE,
        vm: ViewMode.HYBRID,
        param: token.param,
        time: this.wakeUp ?? 0,
      },
    });
    return loadPageXml(await response.text());
  }
}

/** Descramble a fixed-layout CSR page image in place (requires sharp). */
export async function descrambleFixedLayout(
  path: string,
  scrambleSize: [number, number],
  scramble: number[],
  saveOptions: Record<string, unknown> = {},
): Promise<void> {
  let sharp: Awaited<ReturnType<typeof loadSharp>>;
  try {
    sharp = await loadSharp();
  } catch {
    console.warn(
      "Image descramble requires installation with sharp (`npm install sharp`)",
    );
    return;
  }
  // Note: axis usage mirrors upstream exactly (y iterates over width count).
  const [scrambleW, scrambleH] = scrambleSize;
  const tileW = 264;
  const tileH = 368;
  const tiles: Buffer[] = [];
  for (let y = 0; y < scrambleW; y += 1) {
    for (let x = 0; x < scrambleH; x += 1) {
      tiles.push(
        await sharp(path)
          .clone()
          .extract({
            left: x * tileW,
            top: y * tileH,
            width: tileW,
            height: tileH,
          })
          .toBuffer(),
      );
    }
  }
  if (tiles.length < scramble.length) {
    throw new Error("Tile count does not match scramble count");
  }
  const compositeEntries = scramble.map((srcIndex, i) => ({
    input: tiles[srcIndex]!,
    left: (i % scrambleW) * tileW,
    top: Math.floor(i / scrambleH) * tileH,
  }));
  const extension = path.toLowerCase().replace(/^.*\.(?=[^.]+$)/, "");
  const pipeline = sharp({
    create: {
      width: scrambleW * tileW,
      height: scrambleH * tileH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  }).composite(compositeEntries);
  const saveOpts = saveOptions as Record<string, never>;
  const formatted =
    extension === "jpg" || extension === "jpeg"
      ? pipeline.jpeg({ quality: 95, ...saveOpts })
      : pipeline.webp(saveOpts);
  await formatted.toFile(path);
}

/**
 * @deprecated Use {@link EpubFixedSession} instead.
 */
export class EpubSession extends EpubFixedSession {}

/** Options for {@link EpubReflowableSession.downloadEpub}. */
export interface DownloadEpubOptions {
  mkdir?: boolean;
  force?: boolean;
}

/** DLsite Play CSR-R (reflowable epub) Viewer Session. */
export class EpubReflowableSession implements AsyncDisposable {
  private readonly play: PlayAPI;

  readonly ziptree: ZipTree;

  readonly playfile: PlayFile;

  readonly workno: string;

  private token: CsrReflowableToken | undefined;

  private readonly deobfuscators = new Map<number, Deobfuscator>();

  constructor(
    playApi: PlayAPI,
    ziptree: ZipTree,
    playfile: PlayFile,
    workno?: string,
  ) {
    this.play = playApi;
    this.ziptree = ziptree;
    this.playfile = playfile;
    const resolvedWorkno = workno ?? ziptree.workno;
    if (resolvedWorkno === undefined || resolvedWorkno === "") {
      throw new Error("workno must be specified");
    }
    this.workno = resolvedWorkno;
    if (!playfile.isEpubReflowable) {
      throw new Error(`Unsupported epub type: ${playfile.type}`);
    }
  }

  /** Load the session. */
  async load(): Promise<void> {
    if (this.token === undefined) {
      this.token = await this.fetchDownloadToken();
    }
  }

  async close(): Promise<void> {
    this.token = undefined;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  /** Decrypt a buffer with the session key (exposed for testing). */
  testDecrypt(data: Uint8Array, offset = 0): Uint8Array {
    const token = this.token;
    if (token === undefined) {
      throw new DlsiteError("CSR-R token must be loaded");
    }
    if (token.key.length === 0) {
      return data;
    }
    return xorBytes(data, token.key, offset);
  }

  private decrypt(data: Uint8Array, offset: number): Uint8Array {
    return this.testDecrypt(data, offset);
  }

  private async fetchDownloadToken(): Promise<CsrReflowableToken> {
    const keyPair = await generateRsaKeyPair();
    const hashname = (this.playfile.hashname || "").replace(/\.[^.]+$/, "");
    const payload = {
      workno: this.workno,
      hashname,
      revision: this.ziptree.revision ?? "",
      public_key: await spkiBase64(keyPair.publicKey),
      play_type: "epub_reflowable",
    };
    const url = "https://play.dlsite.com/api/v3/csr/reflowable/token";
    const response = await this.play.post(url, { json: payload });
    const data = (await response.json()) as Record<string, unknown>;
    const values = data["values"];
    if (values === null || typeof values !== "object") {
      throw new DlsiteError("Got unexpected csr-r token data.");
    }
    const record = values as Record<string, unknown>;
    const ciphertextB64 = record["key"];
    if (typeof ciphertextB64 !== "string") {
      throw new DlsiteError("Got unexpected csr-r token data.");
    }
    const plaintext = await rsaOaepDecrypt(
      keyPair.privateKey,
      base64ToBytes(ciphertextB64),
    );
    record["key"] = hexToBytes(new TextDecoder().decode(plaintext));
    return CsrReflowableToken.fromJson(record);
  }

  /**
   * Download the reflowable epub to ``destDir/<workno>.epub``.
   *
   * Returns the downloaded file path.
   *
   * Throws:
   *   FileExistsError: destination file already exists.
   */
  async downloadEpub(
    destDir: string,
    options: DownloadEpubOptions = {},
  ): Promise<string> {
    const token = this.token;
    if (token === undefined) {
      throw new DlsiteError("CSR-R session has not been loaded");
    }
    const dest = posix.join(destDir, `${this.workno}.epub`);
    const parent = posix.dirname(dest);
    if (options.force !== true && (await pathExists(dest))) {
      throw new FileExistsError(dest);
    }
    if (options.mkdir === true && !(await pathExists(parent))) {
      await mkdir(parent, { recursive: true });
    }
    const tempDir = await mkdtemp(posix.join(parent, `${posix.basename(dest)}.`));
    try {
      const entries = new Map<string, EpubEntry>();
      const addEntry = (entry: EpubEntry): void => {
        if (!entries.has(entry.arcname)) {
          entries.set(entry.arcname, entry);
        }
      };

      addEntry(await this.fetchEpubEntry(tempDir, "mimetype", token));
      const settingsEntry = await this.fetchEpubEntry(
        tempDir,
        "preprocess-settings.json",
        token,
      );
      const settings = preprocessSettingsFromJson(
        JSON.parse(await readFile(settingsEntry.path, "utf8")) as Record<
          string,
          unknown
        >,
      );
      const container = await this.fetchEpubEntry(
        tempDir,
        "META-INF/container.xml",
        token,
      );
      addEntry(container);
      const opfArcname = await getRootfile(container.path);
      const opf = await this.fetchEpubEntry(tempDir, opfArcname, token);
      addEntry(opf);
      for (const entry of await this.fetchEpubContents(opf, settings, token, tempDir)) {
        addEntry(entry);
      }
      await writeZipArchive(dest, [...entries.values()]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
    return dest;
  }

  private async fetchEpubEntry(
    tempDir: string,
    epubEntry: string,
    token: CsrReflowableToken,
  ): Promise<EpubEntry> {
    const dest = posix.join(tempDir, ...epubEntry.split("/"));
    const parent = posix.dirname(dest);
    if (!(await pathExists(parent))) {
      await mkdir(parent, { recursive: true });
    }
    const url = `${token.baseUrl}/${epubEntry}`;
    const response = await this.play.get(url, {
      headers: { authorization: `Bearer ${encodeURIComponent(token.vt)}` },
      timeout: DL_TIMEOUT_MS,
    });
    await streamToFile(response, dest, (chunk, offset) =>
      this.decrypt(chunk, offset),
    );
    let mtime: Date | undefined;
    const lastModified = response.headers.get("last-modified");
    if (lastModified !== null) {
      const parsed = new Date(lastModified);
      if (!Number.isNaN(parsed.getTime())) {
        mtime = parsed;
        await utimes(dest, parsed, parsed);
      }
    }
    return {
      path: dest,
      arcname: epubEntry,
      ...(mtime !== undefined ? { mtime } : {}),
    };
  }

  private async fetchEpubContents(
    opf: EpubEntry,
    settings: PreprocessSettings,
    token: CsrReflowableToken,
    tempDir: string,
  ): Promise<EpubEntry[]> {
    const $ = cheerio.load(await readFile(opf.path, "utf8"), { xmlMode: true });
    const contents: EpubEntry[] = [];
    const semaphore = new Semaphore(Math.min(32, os.cpus().length + 4));
    const opfDir = posix.dirname(opf.arcname);

    const tasks: Array<Promise<void>> = [];
    $("manifest > item").each((_i, item) => {
      const href = $(item).attr("href");
      if (href === undefined || href === "") {
        return;
      }
      const arcname = posix.join(opfDir, href);
      const mediaType = $(item).attr("media-type");
      tasks.push(
        semaphore.run(async () => {
          try {
            const entry = await this.fetchEpubEntry(tempDir, arcname, token);
            await this.deobfuscate(entry.path, settings, mediaType);
            contents.push({
              ...entry,
              // Non-image entries compress better when deflated.
              ...(!(mediaType ?? "").startsWith("image/")
                ? { deflateHint: true }
                : {}),
            });
          } catch (error) {
            if (error instanceof HTTPError) {
              console.warn(`Failed to download opf manifest entry ${arcname}`);
              return;
            }
            throw error;
          }
        }),
      );
    });
    await Promise.all(tasks);
    return contents;
  }

  private deobfuscate(
    path: string,
    settings: PreprocessSettings,
    mediaType?: string,
  ): Promise<void> {
    if (mediaType === undefined || mediaType === "") {
      return Promise.resolve();
    }
    if (mediaType.startsWith("image/")) {
      return this.deobfuscateImage(path, settings, mediaType);
    }
    return this.deobfuscateText(path, settings, mediaType);
  }

  private async deobfuscateImage(
    path: string,
    settings: PreprocessSettings,
    mediaType: string,
  ): Promise<void> {
    if (!settings.obfuscateImage) {
      return;
    }
    const formats: Record<string, number[]> = {
      "image/gif": [0x47, 0x49, 0x46, 0x38],
      "image/jpeg": [0xff, 0xd8],
      "image/png": [0x89, 0x50, 0x4e, 0x47],
    };
    const magic = formats[mediaType];
    const data = await readFile(path);
    if (magic !== undefined && magic.every((byte, i) => data[i] === byte)) {
      return;
    }
    const key = settings.obfuscateImageKey ?? 0;
    const out = Buffer.from(data);
    for (let i = 0; i < Math.min(100, out.length); i += 1) {
      out[i] = out[i]! ^ key;
    }
    await atomicWriteBytes(path, out);
  }

  private async deobfuscateText(
    path: string,
    settings: PreprocessSettings,
    mediaType: string,
  ): Promise<void> {
    if (!settings.obfuscateText || mediaType !== "application/xhtml+xml") {
      return;
    }
    const content = await readFile(path, "utf8");
    const $ = cheerio.load(content, { xmlMode: true });
    $("span").each((_i, span) => {
      const dataOfs = $(span).attr("data-ofs");
      if (
        dataOfs === undefined ||
        dataOfs === "" ||
        $(span).text().trim() === ""
      ) {
        return;
      }
      const seed = Number.parseInt(dataOfs, 36);
      if (Number.isNaN(seed)) {
        return;
      }
      let deobfuscator = this.deobfuscators.get(seed);
      if (deobfuscator === undefined) {
        deobfuscator = new Deobfuscator(seed);
        this.deobfuscators.set(seed, deobfuscator);
      }
      deobfuscateElement((s) => deobfuscator!.decode(s), span as unknown as DomNodeView);
    });
    await atomicWriteBytes(path, Buffer.from($.xml(), "utf8"));
  }
}

// Minimal structural view of domhandler nodes; duck-typing avoids
// instanceof breakage when multiple domhandler copies are installed.
interface DomNodeView {
  type?: string;
  data?: string;
  children?: DomNodeView[];
}

function deobfuscateElement(
  decode: (s: string) => string,
  element: DomNodeView,
): void {
  for (const child of element.children ?? []) {
    if (child["type"] === "text") {
      if (typeof child["data"] === "string") {
        child["data"] = decode(child["data"]);
      }
    } else {
      deobfuscateElement(decode, child);
    }
  }
}

/** Minimal counting semaphore for bounded concurrent downloads. */
class Semaphore {
  private active = 0;

  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      next?.();
    }
  }
}

/** Extract the OPF rootfile path from META-INF/container.xml. */
async function getRootfile(containerPath: string): Promise<string> {
  const $ = cheerio.load(await readFile(containerPath, "utf8"), {
    xmlMode: true,
  });
  const rootfile = $("rootfile").first();
  const fullPath =
    rootfile.attr("full-path") ?? $("*|rootfile").first().attr("full-path");
  if (fullPath === undefined || fullPath === "") {
    throw new Error("epub container does not contain OPF rootfile");
  }
  return fullPath;
}

async function atomicWriteBytes(path: string, data: Uint8Array): Promise<void> {
  const parent = posix.dirname(path);
  const tempPath = posix.join(
    parent,
    `.${posix.basename(path)}.${crypto.randomUUID()}.tmp`,
  );
  const { writeFile } = await import("node:fs/promises");
  await writeFile(tempPath, data);
  await rename(tempPath, path);
}

async function writeZipArchive(
  dest: string,
  entries: EpubEntry[],
): Promise<void> {
  const tempPath = posix.join(
    posix.dirname(dest),
    `.${posix.basename(dest)}.${crypto.randomUUID()}.tmp`,
  );
  const handle = await open(tempPath, "w");
  let failure: { error: Error } | undefined;
  let chain: Promise<void> = Promise.resolve();

  const zip = new Zip((err, data) => {
    if (err !== null) {
      failure = {
        error: err instanceof Error ? err : new Error(String(err)),
      };
      return;
    }
    const copy = new Uint8Array(data);
    chain = chain.then(async () => {
      await handle.write(copy);
    });
  });

  try {
    for (const entry of entries) {
      const data = await readFile(entry.path);
      let stream: ZipDeflate | ZipPassThrough;
      if (entry.deflateHint === true) {
        stream = new ZipDeflate(entry.arcname, { level: 6 });
      } else {
        stream = new ZipPassThrough(entry.arcname);
      }
      if (entry.mtime !== undefined) {
        stream.mtime = entry.mtime;
      }
      zip.add(stream);
      stream.push(data, true);
    }
    zip.end();
    await chain;
  } finally {
    await handle.close();
  }
  if (failure !== undefined) {
    await unlink(tempPath).catch(() => {});
    throw failure.error;
  }
  await rename(tempPath, dest);
}

/** Seed -> char mapping cache shared across sessions (like upstream). */
const decoders = new Map<number, Record<string, string>>();

/**
 * Character-substitution decoder for obfuscated CSR-R XHTML text.
 *
 * Rebuilds the per-seed shuffled kana/kanji tables used by DLsite's
 * text obfuscation.
 */
export class Deobfuscator {
  private static readonly HIRAGANA =
    "あいうえおかがきぎくぐけげこごさざしじすずせぜそぞただちぢつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもやゆよらりるれろわゐゑをんゔ";

  private static readonly KATAKANA =
    "アイウエオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモヤユヨラリルレロワヰヱヲンヴヷヸヹヺ";

  private static readonly KANJI =
    "国人大年生地的日化本会自中一民政分世業者合動法発行方立権間定力成主子出代物体社" +
    "対家活時事用戦制上学後第経場文多産内性教関高理入条要利保界現実水治度済結部進同" +
    "機金軍議心通義問気見外考東題表数市族約争加原域平品新意連開長下全明支和働府以際" +
    "手食労紀不変言調強作質前期情有共海公反資重農量基電安朝使私由所解運図決報住工都" +
    "思交目正商近酸統料道形必小取北南西月命集二流設次求領展素在組受諸持配書信最独境" +
    "改身面特革";

  private readonly table: Readonly<Record<string, string>>;

  constructor(seed: number) {
    let cached = decoders.get(seed);
    if (cached === undefined) {
      const xorshift = new Xorshift(seed);
      const hiragana = Deobfuscator.HIRAGANA;
      const katakana = Deobfuscator.KATAKANA;
      const kanji = Deobfuscator.KANJI;
      const orig = hiragana + katakana + kanji;
      const shuffled =
        Deobfuscator.shuffle(hiragana, xorshift) +
        Deobfuscator.shuffle(katakana, xorshift) +
        Deobfuscator.shuffle(kanji, xorshift);
      cached = {};
      for (let i = 0; i < orig.length; i += 1) {
        cached[shuffled[i] ?? ""] = orig[i] ?? "";
      }
      decoders.set(seed, cached);
    }
    this.table = cached;
  }

  decode(s: string): string {
    return [...s].map((c) => this.table[c] ?? c).join("");
  }

  private static shuffle(s: string, xorshift: Xorshift): string {
    const chars = [...s];
    let i = 0;
    while (i < s.length - 2) {
      const j = xorshift.pick(i + 1, s.length - 1);
      const tmp = chars[i]!;
      chars[i] = chars[j]!;
      chars[j] = tmp;
      i += 1;
    }
    return chars.join("");
  }
}

/**
 * Xorshift PRNG matching the DLsite viewer's JS implementation
 * (signed 32-bit semantics are native to JS bitwise operators).
 */
export class Xorshift {
  private x = 123456789;

  private y = 362436069;

  private z = 521288629;

  private w: number;

  private readonly seedUnsigned: number;

  private primed = false;

  constructor(seed: number) {
    // ponytail: seeds beyond Number.MAX_SAFE_INTEGER lose precision;
    // realistic base36 data-ofs values stay far below that ceiling.
    this.seedUnsigned = seed >>> 0;
    this.w = seed | 0;
  }

  /** Return the next signed 32-bit value. */
  next(): number {
    const t = (this.x ^ (this.x << 11)) | 0;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    if (!this.primed) {
      // First draw mirrors upstream bignum semantics for arbitrary seeds:
      // the raw seed participates in shifts before js_int truncation.
      const s = this.seedUnsigned;
      const shifted = Math.floor(s / 2 ** 19);
      const tPos = t >>> 0;
      const mixed = (s ^ shifted ^ tPos ^ (tPos >>> 8)) >>> 0;
      this.w = mixed >= 0x80000000 ? mixed - 0x100000000 : mixed;
      this.primed = true;
    } else {
      this.w = (this.w ^ (this.w >> 19) ^ t ^ (t >> 8)) | 0;
    }
    return this.w;
  }

  /** Upstream __call__: seq + abs(next()) % (n + 1 - seq). */
  pick(seq: number, n: number): number {
    return seq + (Math.abs(this.next()) % (n + 1 - seq));
  }
}
