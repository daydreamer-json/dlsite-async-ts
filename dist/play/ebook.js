/** DLsite Play ebook viewer. */
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { DlsiteError, FileExistsError } from "../exceptions.js";
import { base64ToBytes, generateRsaKeyPair, hexToBytes, rsaOaepDecrypt, spkiBase64, } from "../encoding.js";
import { pathExists, streamToFile, xorTransform } from "../stream.js";
import { ViewerToken } from "./models.js";
import { loadSharp } from "./scramble.js";
import { DL_TIMEOUT_MS } from "./api.js";
/** DLsite Play Ebook Viewer Session. */
export class EbookSession {
    #token;
    #meta = {};
    constructor(playApi, ziptree, playfile, workno) {
        this.play = playApi;
        this.ziptree = ziptree;
        this.playfile = playfile;
        const resolvedWorkno = workno ?? ziptree.workno;
        if (resolvedWorkno === undefined || resolvedWorkno === "") {
            throw new Error("workno must be specified");
        }
        this.workno = resolvedWorkno;
        if (!playfile.isEbook) {
            throw new Error(`Unsupported ebook type: ${playfile.type}`);
        }
    }
    metaData() {
        const value = this.#meta["meta_data"];
        return value !== null && typeof value === "object"
            ? value
            : {};
    }
    pages() {
        const value = this.#meta["pages"];
        return Array.isArray(value) ? value : [];
    }
    get title() {
        const value = this.metaData()["title"];
        return typeof value === "string" ? value : "";
    }
    get creators() {
        const value = this.metaData()["creator"];
        return Array.isArray(value) ? value.map(String) : [];
    }
    get pageCount() {
        const value = this.#meta["page_count"];
        return typeof value === "number" ? value : 0;
    }
    get length() {
        return this.pageCount;
    }
    /** Load the session token and viewer metadata. */
    async load() {
        this.#token ??= await this.fetchDownloadToken();
        if (Object.keys(this.#meta).length === 0) {
            this.#meta = await this.fetchMeta();
        }
    }
    async close() {
        this.#token = undefined;
        this.#meta = {};
    }
    [Symbol.asyncDispose]() {
        return this.close();
    }
    async fetchDownloadToken() {
        const keyPair = await generateRsaKeyPair();
        const payload = {
            play_type: this.playfile.type,
            revision: this.ziptree.revision ?? "",
            public_key: await spkiBase64(keyPair.publicKey),
        };
        const url = `https://play.dlsite.com/api/v3/viewer/token/${this.workno}`;
        const response = await this.play.post(url, { json: payload });
        const data = (await response.json());
        const ciphertextB64 = data["key"];
        if (typeof ciphertextB64 !== "string") {
            throw new DlsiteError("Got unexpected viewer_token data.");
        }
        const plaintext = await rsaOaepDecrypt(keyPair.privateKey, base64ToBytes(ciphertextB64));
        data["key"] = hexToBytes(new TextDecoder().decode(plaintext));
        data["v"] = this.ziptree.revision ?? "";
        return ViewerToken.fromJson(data);
    }
    async fetchMeta() {
        const token = this.#token;
        if (token === undefined) {
            throw new DlsiteError("Ebook session has not been loaded");
        }
        const url = `${token.prefix}/${this.playfile.hashname}/viewer-meta.json`;
        const response = await this.play.get(url, {
            searchParams: token.params,
        });
        return (await response.json());
    }
    /**
     * Download one ebook page to the specified directory.
     *
     * Returns downloaded file paths.
     *
     * Throws:
     *   FileExistsError: destination file already exists.
     */
    async downloadPage(index, destDir, options = {}) {
        const token = this.#token;
        if (token === undefined) {
            throw new DlsiteError("Ebook session has not been loaded");
        }
        const page = this.pages()[index];
        if (page === undefined) {
            throw new Error("Invalid page number");
        }
        const src = page["src"];
        if (typeof src !== "string") {
            throw new DlsiteError("Unexpected viewer page data.");
        }
        const results = [];
        const wantImage = options.image ?? true;
        const wantAudio = options.audio ?? true;
        const baseUrl = `${token.prefix}/${this.playfile.hashname}`;
        if (wantImage) {
            let convert = options.convert;
            try {
                if (convert !== undefined) {
                    await loadSharp();
                }
            }
            catch {
                console.warn("Image conversion requires installation with sharp (`npm install sharp`)");
                convert = undefined;
            }
            const extension = convert ?? "webp";
            const stem = basename(src).replace(/\.[^.]+$/, "");
            const dest = join(destDir, `${stem}.${extension}`);
            const parent = dirname(dest);
            if (options.mkdir === true && !(await pathExists(parent))) {
                await mkdir(parent, { recursive: true });
            }
            if (options.force !== true && (await pathExists(dest))) {
                throw new FileExistsError(dest);
            }
            const response = await this.play.get(`${baseUrl}/${src}`, {
                searchParams: token.params,
                timeout: DL_TIMEOUT_MS,
            });
            if (convert === undefined) {
                await streamToFile(response, dest, xorTransform(token.key));
                results.push(dest);
            }
            else {
                const tempWebp = join(parent, `.${stem}.${crypto.randomUUID()}.webp`);
                await streamToFile(response, tempWebp, xorTransform(token.key));
                try {
                    const sharp = await loadSharp();
                    const pipeline = sharp(tempWebp);
                    const formatted = convert === "jpg"
                        ? pipeline.jpeg({
                            quality: 95,
                            ...(options.saveOptions ?? {}),
                        })
                        : pipeline.png((options.saveOptions ?? {}));
                    await formatted.toFile(dest);
                }
                finally {
                    await rm(tempWebp, { force: true });
                }
                results.push(dest);
            }
        }
        if (wantAudio) {
            const audio = page["audio"];
            const audioSrc = audio !== null && typeof audio === "object"
                ? audio["src"]
                : undefined;
            if (typeof audioSrc === "string" && audioSrc !== "") {
                const dest = join(destDir, basename(audioSrc));
                if (options.force !== true && (await pathExists(dest))) {
                    throw new FileExistsError(dest);
                }
                const response = await this.play.get(`${baseUrl}/${audioSrc}`, {
                    searchParams: token.params,
                    timeout: DL_TIMEOUT_MS,
                });
                await streamToFile(response, dest);
                results.push(dest);
            }
        }
        return results;
    }
}
//# sourceMappingURL=ebook.js.map