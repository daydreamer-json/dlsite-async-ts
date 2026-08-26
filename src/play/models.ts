/** Play API response models. */

import { DateTime } from "luxon";

import { DlsiteError } from "../exceptions.js";
import { fromIsoFormat } from "../utils.js";

function requireStr(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string") {
    throw new DlsiteError(`Unexpected Play API data: missing ${key}`);
  }
  return value;
}

const UPDATED_AT_FORMAT = "yyyy-MM-dd HH:mm:ss";

/** Play API download token. */
export class DownloadToken {
  readonly expiresAt: DateTime;
  readonly url: string;

  constructor(fields: { expiresAt: DateTime; url: string }) {
    this.expiresAt = fields.expiresAt;
    this.url = fields.url;
  }

  /** Construct a DownloadToken from JSON response.

   * Throws:
   *   DlsiteError: An error occurred.
   */
  static fromJson(data: Record<string, unknown>): DownloadToken {
    const expires = data["expires"];
    const url = data["url"];
    if (typeof expires !== "string" || typeof url !== "string") {
      throw new DlsiteError("Got unexpected download_token data.");
    }
    return new DownloadToken({
      expiresAt: fromIsoFormat(expires),
      url,
    });
  }

  /** Return expiration as a POSIX timestamp. */
  get expiration(): number {
    return Math.trunc(this.expiresAt.toSeconds());
  }
}

/** File metadata attached to a {@link PlayFile}. */
export type PlayFileInfo = Record<string, unknown>;

/** DLsite Play play-able file. */
export class PlayFile {
  readonly length: number;
  readonly type: string;
  readonly files: Record<string, PlayFileInfo>;
  readonly hashname: string;

  constructor(fields: {
    length: number;
    type: string;
    files: Record<string, PlayFileInfo>;
    hashname: string;
  }) {
    this.length = fields.length;
    this.type = fields.type;
    this.files = fields.files;
    this.hashname = fields.hashname;
  }

  /** Construct a PlayFile from ``ziptree`` JSON playfile data. */
  static fromJson(data: Record<string, unknown>, hashname?: string): PlayFile {
    const type = data["type"];
    const length = data["length"];
    if (typeof type !== "string" || typeof length !== "number") {
      throw new DlsiteError("Got unexpected playfile data.");
    }
    const rawFiles = data[type];
    const files =
      rawFiles !== null && typeof rawFiles === "object"
        ? (rawFiles as Record<string, PlayFileInfo>)
        : {};
    return new PlayFile({ length, type, files, hashname: hashname ?? "" });
  }

  /** Return length as human readable size. */
  get size(): string {
    let length: number = this.length;
    for (const prefix of ["", "K", "M"]) {
      if (Math.abs(length) < 1024) {
        return `${length.toFixed(1)}${prefix}B`;
      }
      length /= 1024;
    }
    return `${length.toFixed(1)}GB`;
  }

  private optimizedInfo(): PlayFileInfo {
    const info = this.files["optimized"];
    if (info === undefined || typeof info !== "object") {
      throw new DlsiteError(
        "No direct-downloadable optimized files in this PlayFile",
      );
    }
    return info;
  }

  /** Return optimized file name. */
  get optimizedName(): string {
    const name = this.optimizedInfo()["name"];
    if (typeof name !== "string") {
      throw new DlsiteError(
        "No direct-downloadable optimized files in this PlayFile",
      );
    }
    return name;
  }

  /** Return optimized file length in bytes. */
  get optimizedLength(): number {
    const length = this.optimizedInfo()["length"];
    if (typeof length !== "number") {
      throw new DlsiteError(
        "No direct-downloadable optimized files in this PlayFile",
      );
    }
    return length;
  }

  get isEbook(): boolean {
    return [
      "ebook_fixed",
      "ebook_voicecomic",
      "ebook_webtoon",
      "voicecomic_v2",
    ].includes(this.type);
  }

  /** @deprecated Use {@link PlayFile.isEpubFixed} instead. */
  get isEpub(): boolean {
    return this.isEpubFixed;
  }

  get isEpubFixed(): boolean {
    return this.type === "epub";
  }

  get isEpubReflowable(): boolean {
    return this.type === "epub_reflowable";
  }
}

/** ZipTree tree file entry. */
export interface TreeFileEntry {
  readonly type: "file";
  readonly hashname: string;
  readonly name: string;
}

/** ZipTree hidden file entry. */
export interface TreeHiddenEntry {
  readonly type: "hidden";
  readonly hashname: string;
  readonly name: string;
}

/** ZipTree tree folder entry. */
export interface TreeFolderEntry {
  readonly type: "folder";
  readonly children: TreeEntry[];
  readonly name: string;
  readonly path: string;
}

export type TreeEntry = TreeFileEntry | TreeHiddenEntry | TreeFolderEntry;

function treeEntryFromJson(data: Record<string, unknown>): TreeEntry {
  switch (data["type"]) {
    case "file":
    case "hidden": {
      return {
        type: data["type"],
        hashname: requireStr(data, "hashname"),
        name: requireStr(data, "name"),
      };
    }
    case "folder": {
      const children = data["children"];
      return {
        type: "folder",
        children: Array.isArray(children)
          ? children.map((child) =>
              treeEntryFromJson(child as Record<string, unknown>),
            )
          : [],
        name: requireStr(data, "name"),
        path: requireStr(data, "path"),
      };
    }
    default: {
      throw new DlsiteError(
        `Unsupported ziptree entry type: ${String(data["type"])}`,
      );
    }
  }
}

/** Play API zip tree.
 *
 * Provides an additional dict-like interface to access PlayFiles in the tree
 * by relative path.
 *
 * Note:
 *   Paths are separated by the POSIX path separator ``/``.
 */
export class ZipTree {
  readonly hash: string;
  readonly playfile: Record<string, PlayFile>;
  readonly tree: TreeEntry[];
  readonly workno?: string;
  readonly version?: string;
  readonly revision?: string;
  readonly updatedAt?: DateTime;

  constructor(fields: {
    hash: string;
    playfile: Record<string, PlayFile>;
    tree: TreeEntry[];
    workno?: string;
    version?: string;
    revision?: string;
    updatedAt?: DateTime;
  }) {
    this.hash = fields.hash;
    this.playfile = fields.playfile;
    this.tree = fields.tree;
    if (fields.workno !== undefined) {
      this.workno = fields.workno;
    }
    if (fields.version !== undefined) {
      this.version = fields.version;
    }
    if (fields.revision !== undefined) {
      this.revision = fields.revision;
    }
    if (fields.updatedAt !== undefined) {
      this.updatedAt = fields.updatedAt;
    }
  }

  /** Construct a ZipTree from ``ziptree`` JSON data.

   * Throws:
   *   DlsiteError: An error occurred.
   */
  static fromJson(data: Record<string, unknown>): ZipTree {
    const hash = requireStr(data, "hash");
    const rawPlayfile = data["playfile"];
    const playfile: Record<string, PlayFile> = {};
    if (rawPlayfile !== null && typeof rawPlayfile === "object") {
      for (const [key, value] of Object.entries(
        rawPlayfile as Record<string, unknown>,
      )) {
        playfile[key] = PlayFile.fromJson(
          value as Record<string, unknown>,
          key,
        );
      }
    }
    const rawTree = data["tree"];
    const tree = Array.isArray(rawTree)
      ? rawTree.map((entry) => treeEntryFromJson(entry as Record<string, unknown>))
      : [];
    let updatedAt: DateTime | undefined;
    if (typeof data["updated_at"] === "string") {
      const parsed = DateTime.fromFormat(
        data["updated_at"],
        UPDATED_AT_FORMAT,
      );
      if (parsed.isValid) {
        updatedAt = parsed;
      }
    }
    return new ZipTree({
      hash,
      playfile,
      tree,
      ...(typeof data["workno"] === "string" ? { workno: data["workno"] } : {}),
      ...(typeof data["version"] === "string"
        ? { version: data["version"] }
        : {}),
      ...(typeof data["revision"] === "string"
        ? { revision: data["revision"] }
        : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    });
  }

  #pathCache?: Map<string, PlayFile>;

  private get pathsByFile(): Map<string, PlayFile> {
    this.#pathCache ??= new Map(this.walk(this.tree));
    return this.#pathCache;
  }

  private *walk(
    entries: Iterable<TreeEntry>,
    parent?: string,
  ): Generator<[string, PlayFile]> {
    for (const entry of entries) {
      if (entry.type === "folder") {
        yield* this.walk(entry.children, entry.path);
        continue;
      }
      // Both "file" and "hidden" entries map onto playfiles (upstream
      // matches hidden entries too via isinstance of the file base class).
      const path =
        parent !== undefined ? `${parent}/${entry.name}` : entry.name;
      const playfile = this.playfile[entry.hashname];
      if (playfile !== undefined) {
        yield [path, playfile];
      }
    }
  }

  /** Iterate over `[path, playfile]` pairs in the tree. */
  entries(): IterableIterator<[string, PlayFile]> {
    return this.pathsByFile.entries();
  }

  /** Return the PlayFile at the given relative path, if present. */
  get(path: string): PlayFile | undefined {
    return this.pathsByFile.get(path);
  }

  /** Number of playfiles reachable in the tree. */
  get size(): number {
    return this.pathsByFile.size;
  }

  [Symbol.iterator](): IterableIterator<[string, PlayFile]> {
    return this.entries();
  }
}

/** Ebook Viewer API download token. */
export class ViewerToken {
  readonly expireAt: DateTime;
  readonly key: Uint8Array;
  readonly prefix: string;
  readonly keyPairId: string;
  readonly policy: string;
  readonly signature: string;
  readonly d?: string;
  readonly v: string;

  constructor(fields: {
    expireAt: DateTime;
    key: Uint8Array;
    prefix: string;
    keyPairId: string;
    policy: string;
    signature: string;
    d?: string;
    v: string;
  }) {
    this.expireAt = fields.expireAt;
    this.key = fields.key;
    this.prefix = fields.prefix;
    this.keyPairId = fields.keyPairId;
    this.policy = fields.policy;
    this.signature = fields.signature;
    if (fields.d !== undefined) {
      this.d = fields.d;
    }
    this.v = fields.v;
  }

  /** Query parameters required by viewer endpoints. */
  get params(): Record<string, string> {
    const p: Record<string, string> = {
      Policy: this.policy,
      Signature: this.signature,
      "Key-Pair-Id": this.keyPairId,
    };
    if (this.d !== undefined) {
      p["d"] = this.d;
    }
    p["v"] = this.v;
    return p;
  }

  /** Construct a ViewerToken from JSON response.

   * Throws:
   *   DlsiteError: An error occurred.
   */
  static fromJson(data: Record<string, unknown>): ViewerToken {
    try {
      const expireAt = fromIsoFormat(requireStr(data, "expireAt"));
      const parameters =
        data["parameters"] !== null && typeof data["parameters"] === "object"
          ? (data["parameters"] as Record<string, unknown>)
          : {};
      const rawKey = data["key"];
      const key =
        rawKey instanceof Uint8Array ? rawKey : new Uint8Array(0);
      return new ViewerToken({
        expireAt,
        key,
        prefix: requireStr(data, "prefix"),
        keyPairId: requireStr(parameters, "Key-Pair-Id"),
        policy: requireStr(parameters, "Policy"),
        signature: requireStr(parameters, "Signature"),
        ...(typeof data["d"] === "string" ? { d: data["d"] } : {}),
        v: typeof data["v"] === "string" ? data["v"] : "",
      });
    } catch (error) {
      if (error instanceof DlsiteError) {
        throw error;
      }
      throw new DlsiteError("Got unexpected viewer_token data.");
    }
  }
}

/** CSR viewer API download token. */
export class CsrToken {
  readonly cgi: string;
  readonly param: string;
  readonly workno: string;
  readonly customerId: string;

  constructor(fields: {
    cgi: string;
    param: string;
    workno: string;
    customerId: string;
  }) {
    this.cgi = fields.cgi;
    this.param = fields.param;
    this.workno = fields.workno;
    this.customerId = fields.customerId;
  }

  static fromJson(data: Record<string, unknown>): CsrToken {
    return new CsrToken({
      cgi: requireStr(data, "cgi"),
      param: requireStr(data, "param"),
      workno: requireStr(data, "workno"),
      customerId: requireStr(data, "customer_id"),
    });
  }
}

/** CSR-R viewer API download token. */
export class CsrReflowableToken {
  readonly vt: string;
  readonly c: string;
  readonly baseUrl: string;
  readonly accountId: string;
  readonly customerId: string;
  readonly key: Uint8Array;

  constructor(fields: {
    vt: string;
    c: string;
    baseUrl: string;
    accountId: string;
    customerId: string;
    key: Uint8Array;
  }) {
    this.vt = fields.vt;
    this.c = fields.c;
    this.baseUrl = fields.baseUrl;
    this.accountId = fields.accountId;
    this.customerId = fields.customerId;
    this.key = fields.key;
  }

  static fromJson(data: Record<string, unknown>): CsrReflowableToken {
    return new CsrReflowableToken({
      vt: requireStr(data, "vt"),
      c: requireStr(data, "c"),
      baseUrl: requireStr(data, "base_url"),
      accountId: requireStr(data, "account_id"),
      customerId: requireStr(data, "customer_id"),
      key: data["key"] instanceof Uint8Array ? data["key"] : new Uint8Array(0),
    });
  }
}
