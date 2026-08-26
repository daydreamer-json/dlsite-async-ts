/** DLsite Play API classes. */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DateTime } from "luxon";
import { BaseAPI } from "../api.js";
import { DlsiteError, FileExistsError } from "../exceptions.js";
import { pathExists, streamToFile } from "../stream.js";
import { ageCategoryFromName, workTypeFromValue, Work, } from "../work.js";
import { fromIsoFormat } from "../utils.js";
import { DownloadToken, PlayFile, ZipTree, } from "./models.js";
import { descramble as descrambleImage } from "./scramble.js";
/** DLsite Play API session. */
export class PlayAPI extends BaseAPI {
    constructor(locale, options = {}) {
        super(options);
        this.locale = locale;
    }
    /** Login to DLsite Play. */
    async login(loginId, password, netrcHost = "dlsite.com") {
        await super.login(loginId, password, netrcHost);
        const loginResponse = await this.get("https://play.dlsite.com/login/");
        await loginResponse.arrayBuffer();
        const authorizeResponse = await this.get("https://play.dlsite.com/api/authorize", { headers: { referer: "https://play.dlsite.com/" } });
        await authorizeResponse.arrayBuffer();
    }
    /** Return a download token for the specified workno. */
    async downloadToken(workno) {
        const url = "https://play.dl.dlsite.com/api/v3/download/sign/cookie";
        const response = await this.get(url, { searchParams: { workno } });
        return DownloadToken.fromJson(await response.json());
    }
    /** Return ziptree for the specified download. */
    async ziptree(token) {
        const response = await this.get(`${token.url}ziptree.json`);
        return ZipTree.fromJson(await response.json());
    }
    /** Download a playfile to the specified location.
     *
     * Throws:
     *   FileExistsError: ``dest`` already exists.
     */
    async downloadPlayfile(token, playfile, dest, options = {}) {
        let optimizedName;
        try {
            optimizedName = playfile.optimizedName;
        }
        catch (error) {
            if (!(error instanceof DlsiteError)) {
                throw error;
            }
            console.warn(`Could not download ${dest}: no web-optimized version available.`);
            return;
        }
        const parent = dirname(dest);
        if (options.mkdir === true && !(await pathExists(parent))) {
            await mkdir(parent, { recursive: true });
        }
        if (options.force !== true && (await pathExists(dest))) {
            throw new FileExistsError(dest);
        }
        const url = `${token.url}optimized/${optimizedName}`;
        const response = await this.get(url, {
            timeout: DL_TIMEOUT_MS,
        });
        await streamToFile(response, dest);
        const crypt = playfile.files["optimized"]?.["crypt"];
        if (playfile.type === "image" &&
            crypt === true &&
            options.descramble === true) {
            await descrambleImage(dest, playfile, options.saveOptions ?? {});
        }
    }
    /**
     * Iterate over purchased works.
     *
     * Yields tuples of the purchased work and its purchase date. Purchases are
     * requested in batches of 100 and yielded per batch; they are not
     * guaranteed to be in historical order.
     */
    async *purchases(last) {
        const url = "https://play.dlsite.com/api/v3/content/works";
        const lastTs = last !== undefined ? Math.trunc(last.toSeconds()) : 0;
        const count = await this.getProductCount(lastTs);
        if (count < 1) {
            return;
        }
        const { worknos, sales } = await this.getProductSales(lastTs);
        for (let start = 0; start < worknos.length; start += 100) {
            const batch = worknos.slice(start, start + 100);
            const response = await this.post(url, { json: batch });
            const data = (await response.json());
            const works = Array.isArray(data.works) ? data.works : [];
            for (const raw of works) {
                const [purchase, salesDate] = parsePurchase(raw, this.locale ?? "ja_JP");
                yield [purchase, sales.get(purchase.productId) ?? salesDate];
            }
        }
    }
    async getProductCount(last) {
        const response = await this.get("https://play.dlsite.com/api/v3/content/count", { searchParams: { last: String(last) } });
        const data = (await response.json());
        const user = data["user"];
        return typeof user === "number" ? user : 0;
    }
    async getProductSales(last) {
        const response = await this.get("https://play.dlsite.com/api/v3/content/sales", { searchParams: { last: String(last) } });
        const data = (await response.json());
        const worknos = [];
        const sales = new Map();
        if (!Array.isArray(data)) {
            return { worknos, sales };
        }
        for (const item of data) {
            if (item === null || typeof item !== "object") {
                continue;
            }
            const record = item;
            const workno = record["workno"];
            if (typeof workno !== "string") {
                continue;
            }
            // Like upstream, the workno is collected even when sales data is absent.
            worknos.push(workno);
            const salesDate = record["sales_date"];
            if (typeof salesDate !== "string") {
                continue;
            }
            try {
                sales.set(workno, fromIsoFormat(salesDate));
            }
            catch {
                continue;
            }
        }
        return { worknos, sales };
    }
}
/** Long timeout used for large downloads. */
export const DL_TIMEOUT_MS = 10 * 60 * 1000;
const TAG_CLASSES = {
    created_by: "author",
    scenario_by: "scenario",
    illust_by: "illustration",
    voice_by: "voiceActor",
    music_by: "music",
};
function snakeToCamel(key) {
    return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function localizedName(d, locale) {
    const localized = d[locale] ?? d["ja_JP"] ?? "";
    return String(localized);
}
/** Construct a Work from a purchases API dictionary. */
export function parsePurchase(raw, locale = "ja_JP") {
    const d = {};
    for (const [key, value] of Object.entries(raw)) {
        d[snakeToCamel(key)] = value;
    }
    d["ageCategory"] = ageCategoryFromName(String(raw["age_category"]));
    const makerId = typeof raw["maker"] === "object" && raw["maker"] !== null
        ? String(raw["maker"]["id"])
        : "";
    d["makerId"] = makerId;
    const maker = raw["maker"] !== null && typeof raw["maker"] === "object"
        ? raw["maker"]
        : {};
    const makerNames = typeof maker["name"] === "object" && maker["name"] !== null
        ? maker["name"]
        : {};
    delete d["maker"];
    if (makerId.startsWith("R")) {
        d["circle"] = localizedName(makerNames, locale);
    }
    else {
        d["brand"] = localizedName(makerNames, locale);
    }
    d["workName"] =
        raw["name"] !== null && typeof raw["name"] === "object"
            ? localizedName(raw["name"], locale)
            : "";
    delete d["name"];
    let salesDate;
    if (typeof raw["regist_date"] === "string") {
        d["registDate"] = fromIsoFormat(raw["regist_date"]);
    }
    if (typeof raw["sales_date"] === "string") {
        salesDate = fromIsoFormat(raw["sales_date"]);
    }
    const tags = Array.isArray(raw["tags"]) ? raw["tags"] : [];
    for (const tag of tags) {
        if (tag === null || typeof tag !== "object") {
            continue;
        }
        const record = tag;
        const field = TAG_CLASSES[String(record["class"] ?? "")];
        if (field !== undefined && typeof record["name"] === "string") {
            const list = Array.isArray(d[field]) ? d[field] : [];
            list.push(record["name"]);
            d[field] = list.map(String);
        }
    }
    if (typeof raw["upgrade_date"] === "string") {
        d["modifiedDate"] = fromIsoFormat(raw["upgrade_date"]);
    }
    const workFiles = raw["work_files"] !== null && typeof raw["work_files"] === "object"
        ? raw["work_files"]
        : {};
    const sampleImages = [];
    for (const [key, value] of Object.entries(workFiles)) {
        if (typeof value !== "string") {
            continue;
        }
        if (key === "main") {
            d["workImage"] = value;
        }
        else {
            sampleImages.push(value);
        }
    }
    if (sampleImages.length > 0) {
        d["sampleImages"] = sampleImages;
    }
    if (typeof raw["work_type"] === "string") {
        d["workType"] = workTypeFromValue(raw["work_type"]);
    }
    d["productId"] = String(raw["workno"]);
    return [Work.fromDict(d), salesDate];
}
//# sourceMappingURL=api.js.map