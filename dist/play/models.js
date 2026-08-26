/** Play API response models. */
import { DateTime } from "luxon";
import { DlsiteError } from "../exceptions.js";
import { fromIsoFormat } from "../utils.js";
function requireStr(data, key) {
    const value = data[key];
    if (typeof value !== "string") {
        throw new DlsiteError(`Unexpected Play API data: missing ${key}`);
    }
    return value;
}
const UPDATED_AT_FORMAT = "yyyy-MM-dd HH:mm:ss";
/** Play API download token. */
export class DownloadToken {
    constructor(fields) {
        this.expiresAt = fields.expiresAt;
        this.url = fields.url;
    }
    /** Construct a DownloadToken from JSON response.
  
     * Throws:
     *   DlsiteError: An error occurred.
     */
    static fromJson(data) {
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
    get expiration() {
        return Math.trunc(this.expiresAt.toSeconds());
    }
}
/** DLsite Play play-able file. */
export class PlayFile {
    constructor(fields) {
        this.length = fields.length;
        this.type = fields.type;
        this.files = fields.files;
        this.hashname = fields.hashname;
    }
    /** Construct a PlayFile from ``ziptree`` JSON playfile data. */
    static fromJson(data, hashname) {
        const type = data["type"];
        const length = data["length"];
        if (typeof type !== "string" || typeof length !== "number") {
            throw new DlsiteError("Got unexpected playfile data.");
        }
        const rawFiles = data[type];
        const files = rawFiles !== null && typeof rawFiles === "object"
            ? rawFiles
            : {};
        return new PlayFile({ length, type, files, hashname: hashname ?? "" });
    }
    /** Return length as human readable size. */
    get size() {
        let length = this.length;
        for (const prefix of ["", "K", "M"]) {
            if (Math.abs(length) < 1024) {
                return `${length.toFixed(1)}${prefix}B`;
            }
            length /= 1024;
        }
        return `${length.toFixed(1)}GB`;
    }
    optimizedInfo() {
        const info = this.files["optimized"];
        if (info === undefined || typeof info !== "object") {
            throw new DlsiteError("No direct-downloadable optimized files in this PlayFile");
        }
        return info;
    }
    /** Return optimized file name. */
    get optimizedName() {
        const name = this.optimizedInfo()["name"];
        if (typeof name !== "string") {
            throw new DlsiteError("No direct-downloadable optimized files in this PlayFile");
        }
        return name;
    }
    /** Return optimized file length in bytes. */
    get optimizedLength() {
        const length = this.optimizedInfo()["length"];
        if (typeof length !== "number") {
            throw new DlsiteError("No direct-downloadable optimized files in this PlayFile");
        }
        return length;
    }
    get isEbook() {
        return [
            "ebook_fixed",
            "ebook_voicecomic",
            "ebook_webtoon",
            "voicecomic_v2",
        ].includes(this.type);
    }
    /** @deprecated Use {@link PlayFile.isEpubFixed} instead. */
    get isEpub() {
        return this.isEpubFixed;
    }
    get isEpubFixed() {
        return this.type === "epub";
    }
    get isEpubReflowable() {
        return this.type === "epub_reflowable";
    }
}
function treeEntryFromJson(data) {
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
                    ? children.map((child) => treeEntryFromJson(child))
                    : [],
                name: requireStr(data, "name"),
                path: requireStr(data, "path"),
            };
        }
        default: {
            throw new DlsiteError(`Unsupported ziptree entry type: ${String(data["type"])}`);
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
    constructor(fields) {
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
    static fromJson(data) {
        const hash = requireStr(data, "hash");
        const rawPlayfile = data["playfile"];
        const playfile = {};
        if (rawPlayfile !== null && typeof rawPlayfile === "object") {
            for (const [key, value] of Object.entries(rawPlayfile)) {
                playfile[key] = PlayFile.fromJson(value, key);
            }
        }
        const rawTree = data["tree"];
        const tree = Array.isArray(rawTree)
            ? rawTree.map((entry) => treeEntryFromJson(entry))
            : [];
        let updatedAt;
        if (typeof data["updated_at"] === "string") {
            const parsed = DateTime.fromFormat(data["updated_at"], UPDATED_AT_FORMAT);
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
    #pathCache;
    get pathsByFile() {
        this.#pathCache ??= new Map(this.walk(this.tree));
        return this.#pathCache;
    }
    *walk(entries, parent) {
        for (const entry of entries) {
            if (entry.type === "folder") {
                yield* this.walk(entry.children, entry.path);
                continue;
            }
            // Both "file" and "hidden" entries map onto playfiles (upstream
            // matches hidden entries too via isinstance of the file base class).
            const path = parent !== undefined ? `${parent}/${entry.name}` : entry.name;
            const playfile = this.playfile[entry.hashname];
            if (playfile !== undefined) {
                yield [path, playfile];
            }
        }
    }
    /** Iterate over `[path, playfile]` pairs in the tree. */
    entries() {
        return this.pathsByFile.entries();
    }
    /** Return the PlayFile at the given relative path, if present. */
    get(path) {
        return this.pathsByFile.get(path);
    }
    /** Number of playfiles reachable in the tree. */
    get size() {
        return this.pathsByFile.size;
    }
    [Symbol.iterator]() {
        return this.entries();
    }
}
/** Ebook Viewer API download token. */
export class ViewerToken {
    constructor(fields) {
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
    get params() {
        const p = {
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
    static fromJson(data) {
        try {
            const expireAt = fromIsoFormat(requireStr(data, "expireAt"));
            const parameters = data["parameters"] !== null && typeof data["parameters"] === "object"
                ? data["parameters"]
                : {};
            const rawKey = data["key"];
            const key = rawKey instanceof Uint8Array ? rawKey : new Uint8Array(0);
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
        }
        catch (error) {
            if (error instanceof DlsiteError) {
                throw error;
            }
            throw new DlsiteError("Got unexpected viewer_token data.");
        }
    }
}
/** CSR viewer API download token. */
export class CsrToken {
    constructor(fields) {
        this.cgi = fields.cgi;
        this.param = fields.param;
        this.workno = fields.workno;
        this.customerId = fields.customerId;
    }
    static fromJson(data) {
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
    constructor(fields) {
        this.vt = fields.vt;
        this.c = fields.c;
        this.baseUrl = fields.baseUrl;
        this.accountId = fields.accountId;
        this.customerId = fields.customerId;
        this.key = fields.key;
    }
    static fromJson(data) {
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
//# sourceMappingURL=models.js.map