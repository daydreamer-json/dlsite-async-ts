/** HTML scraper. */
import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { ScrapingError } from "./exceptions.js";
/** Return unescaped (by cheerio) and normalized text content. */
function clean(content) {
    return (content ?? "").normalize("NFKC").trim();
}
function textParser(field, headers) {
    return {
        field,
        headers: new Set(headers),
        parse(td, $) {
            return clean($(td).text());
        },
    };
}
const DATE_FORMATS = [
    "yyyy'年'MM'月'dd'日'",
    "MMM/dd/yyyy",
    "MMMM/dd/yyyy",
];
function toDateTime(value) {
    for (const format of DATE_FORMATS) {
        const dt = DateTime.fromFormat(value, format, { locale: "en" });
        if (dt.isValid) {
            return dt;
        }
    }
    throw new ScrapingError(`Failed to parse date string ${value}`);
}
function dateParser(field, headers) {
    return {
        field,
        headers: new Set(headers),
        parse(td, $) {
            const value = clean($(td).text()).split(/\s+/)[0] ?? "";
            return toDateTime(value);
        },
    };
}
function intParser(field, headers) {
    return {
        field,
        headers: new Set(headers),
        parse(td, $) {
            const value = clean($(td).text());
            if (!/^\d+$/.test(value)) {
                throw new ScrapingError(`Failed to parse integer ${value}`);
            }
            return Number.parseInt(value, 10);
        },
    };
}
function makerParser(field, headers) {
    return {
        field,
        headers: new Set(headers),
        parse(td, $) {
            // Upstream looks up the maker name span document-wide; newer layouts
            // (comipo) place a plain link in the cell instead.
            const span = $("span.maker_name").first();
            const name = span.length > 0 ? clean(span.text()) : clean($(td).text());
            if (name === "") {
                throw new ScrapingError("Failed to parse maker cell");
            }
            return name;
        },
    };
}
function listParser(field, headers) {
    return {
        field,
        headers: new Set(headers),
        parse(td, $) {
            const anchors = $(td)
                .find("a")
                .map((_, a) => clean($(a).text()))
                .get()
                .filter((s) => s !== "");
            if (anchors.length > 0) {
                return anchors;
            }
            const seen = new Set();
            const values = [];
            for (const span of $(td).find("span").toArray()) {
                const value = clean($(span).text());
                if (value !== "" && !seen.has(value)) {
                    seen.add(value);
                    values.push(value);
                }
            }
            return values;
        },
    };
}
const PARSERS = [
    dateParser("announceDate", ["予告開始日", "Published date"]),
    dateParser("modifiedDate", [
        "最終更新日",
        "更新情報",
        "Last updated",
        "Update information",
    ]),
    intParser("pageCount", ["ページ数", "Page count"]),
    makerParser("brand", ["ブランド名", "Brand"]),
    makerParser("circle", ["サークル名", "Circle"]),
    makerParser("publisher", ["出版社名", "出版社", "Publisher"]),
    makerParser("label", ["レーベル", "Label"]),
    listParser("author", ["作者", "著者", "Author"]),
    listParser("event", ["イベント", "Event"]),
    listParser("fileFormat", ["ファイル形式", "File format"]),
    listParser("illustration", ["イラスト", "Illustration"]),
    listParser("genre", ["ジャンル", "Genre"]),
    listParser("music", ["音楽", "Music"]),
    listParser("scenario", ["シナリオ", "Scenario"]),
    listParser("voiceActor", ["声優", "Voice Actor"]),
    listParser("writer", ["作家", "Writer"]),
    textParser("fileSize", ["ファイル容量", "File size"]),
    textParser("titleNameMasked", [
        "シリーズ",
        "シリーズ名",
        "Series",
        "Series name",
    ]),
];
function findParser(header) {
    return PARSERS.find((parser) => parser.headers.has(header));
}
function assignValue(info, field, value) {
    // Each parser's field key matches its produced value type.
    info[field] = value;
}
function tryParseCell(info, parser, td, $) {
    try {
        assignValue(info, parser.field, parser.parse(td, $));
    }
    catch (error) {
        if (!(error instanceof ScrapingError)) {
            throw error;
        }
    }
}
function parseOutlineRow(info, tr, $) {
    const th = $(tr).find("th").get(0);
    const td = $(tr).find("td").get(0);
    if (th === undefined || td === undefined) {
        return;
    }
    const header = clean($(th).text());
    const parser = findParser(header);
    if (parser === undefined) {
        return;
    }
    tryParseCell(info, parser, td, $);
}
function parseComipoProductInfo(info, dl, $) {
    const children = $(dl).children().toArray();
    for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (child === undefined || child.tagName !== "dt") {
            continue;
        }
        const header = clean($(child).text());
        const parser = findParser(header);
        if (parser === undefined) {
            continue;
        }
        for (let j = i + 1; j < children.length; j += 1) {
            const sibling = children[j];
            if (sibling === undefined || sibling.tagName !== "dd") {
                break;
            }
            tryParseCell(info, parser, sibling, $);
        }
    }
}
const DESC_EN_RE = /"DLsite.*DLsite!$/;
const DESC_JP_RE = /「DLsite[^」]*」.*「DLsite[^」]*」!$/;
const DESC_COMIPO_JP_RE = /「comipo[^-]*-/;
function parseWorkDescription(info, meta, $) {
    let content = clean($(meta).attr("content"));
    if (content === "") {
        return;
    }
    content = content.replace(DESC_EN_RE, "").trim();
    content = content.replace(DESC_JP_RE, "").trim();
    content = content.replace(DESC_COMIPO_JP_RE, "").trim();
    if (content !== "") {
        info.description = content;
    }
}
/** Parse work HTML into partial work details. */
export function parseWorkHtml(content) {
    const $ = cheerio.load(content);
    const info = {};
    for (const selector of ["table#work_maker", "table#work_outline"]) {
        $(selector)
            .find("tr")
            .each((_i, tr) => {
            parseOutlineRow(info, tr, $);
        });
    }
    $("dl.c-productInfo__box").each((_i, dl) => {
        parseComipoProductInfo(info, dl, $);
    });
    const sampleImages = [];
    $("div.product-slider-data div[data-src]").each((_i, div) => {
        const src = $(div).attr("data-src");
        if (src !== undefined && !src.includes("_img_main")) {
            sampleImages.push(src);
        }
    });
    if (sampleImages.length > 0) {
        info.sampleImages = sampleImages;
    }
    $('meta[name="description"]').each((_i, meta) => {
        parseWorkDescription(info, meta, $);
    });
    return info;
}
/** Parse circle HTML. */
export function parseCircleHtml(content) {
    const $ = cheerio.load(content);
    const makerName = clean($("strong.prof_maker_name").first().text());
    if (makerName === "") {
        throw new ScrapingError("Failed to find maker name");
    }
    return { makerName };
}
/** Parse login form token. */
export function parseLoginToken(content) {
    const $ = cheerio.load(content);
    const token = $('input[name="_token"]').attr("value");
    if (token === undefined) {
        throw new ScrapingError("Failed to find login form token.");
    }
    return token;
}
//# sourceMappingURL=scraper.js.map