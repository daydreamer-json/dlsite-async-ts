/** DLsite work classes. */
import { DateTime } from "luxon";
/** Named constants for {@link AgeCategory} values. */
export const AgeCategory = {
    ALL_AGES: 1,
    ALL: 1,
    R15: 2,
    R18: 3,
};
/** Build an {@link AgeCategory} from its numeric value. */
export function ageCategoryFromValue(value) {
    if (value === 1 || value === 2 || value === 3) {
        return value;
    }
    throw new Error(`Invalid age category value: ${value}`);
}
const AGE_CATEGORY_NAMES = {
    ALL_AGES: 1,
    ALL: 1,
    R15: 2,
    R18: 3,
};
/** Build an {@link AgeCategory} from its name (e.g. `"R18"`). */
export function ageCategoryFromName(name) {
    const value = AGE_CATEGORY_NAMES[name.toUpperCase()];
    if (value === undefined) {
        throw new Error(`Invalid age category name: ${name}`);
    }
    return value;
}
/** Named constants for {@link BookType} values. */
export const BookType = {
    BOOK: "comic",
    MAGAZINE: "magazine",
    PUBLICATION: "publication",
    STANDALONE: "oneshot",
};
/** Build a {@link BookType} from its value. */
export function bookTypeFromValue(value) {
    if (value === "comic" ||
        value === "magazine" ||
        value === "publication" ||
        value === "oneshot") {
        return value;
    }
    throw new Error(`Invalid book type value: ${value}`);
}
/** Named constants for {@link WorkType} values. */
export const WorkType = {
    ACTION: "ACN",
    ADVENTURE: "ADV",
    QUIZ: "QIZ",
    CG_ILLUSTRATIONS: "ICG",
    DIGITAL_NOVEL: "DNV",
    GEKIGA: "SCM",
    ILLUST_MATERIALS: "IMT",
    MANGA: "MNG",
    MISCELLANEOUS: "ET3",
    MISCELLANEOUS_GAME: "ETC",
    MUSIC: "MUS",
    MUSIC_MATERIALS: "AMT",
    NOVEL: "NRE",
    PUBLICATION: "PBC",
    PUZZLE: "PZL",
    ROLE_PLAYING: "RPG",
    SHOOTING: "STG",
    SIMULATION: "SLN",
    TABLE: "TBL",
    TOOLS_ACCESSORIES: "TOL",
    TYPING: "TYP",
    VIDEO: "MOV",
    VOICE_ASMR: "SOU",
    VOICED_COMIC: "VCM",
    WEBTOON: "WBT",
};
const WORK_TYPE_VALUES = new Set(Object.values(WorkType));
/** Build a {@link WorkType} from its value. */
export function workTypeFromValue(value) {
    if (WORK_TYPE_VALUES.has(value)) {
        return value;
    }
    throw new Error(`Invalid work type value: ${value}`);
}
/** Field names of {@link WorkFields}. */
export const WORK_FIELDS = new Set(Object.keys({
    productId: null,
    siteId: null,
    makerId: null,
    workName: null,
    ageCategory: null,
    circle: null,
    brand: null,
    publisher: null,
    workImage: null,
    registDate: null,
    workType: null,
    bookType: null,
    announceDate: null,
    modifiedDate: null,
    scenario: null,
    illustration: null,
    voiceActor: null,
    author: null,
    music: null,
    writer: null,
    genre: null,
    label: null,
    event: null,
    fileFormat: null,
    fileSize: null,
    language: null,
    pageCount: null,
    description: null,
    sampleImages: null,
    workNameMasked: null,
    titleName: null,
    titleNameMasked: null,
}));
/** DLsite work (product) class. */
export class Work {
    /** Construct a Work from field data. Fields set to undefined are skipped. */
    constructor(fields) {
        this.productId = fields.productId;
        this.siteId = fields.siteId;
        this.makerId = fields.makerId;
        this.workName = fields.workName;
        this.ageCategory = fields.ageCategory;
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) {
                this[key] = value;
            }
        }
    }
    /**
     * Construct a Work from a dictionary.
     *
     * Keys must be camelCase field names of {@link WorkFields}; unknown keys
     * are ignored. Values must already be normalized (DateTime, WorkType, etc).
     */
    static fromDict(d) {
        const fields = {};
        for (const [key, value] of Object.entries(d)) {
            if (WORK_FIELDS.has(key)) {
                fields[key] = value;
            }
        }
        return new Work(fields);
    }
    /** Release date. */
    get releaseDate() {
        return this.registDate;
    }
    /** Series name. Set for backwards compatibility. */
    get series() {
        return this.titleNameMasked ?? this.titleName;
    }
}
//# sourceMappingURL=work.js.map