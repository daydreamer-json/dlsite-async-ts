/** DLsite work classes. */
import { DateTime } from "luxon";
/** Work age rating. */
export type AgeCategory = 1 | 2 | 3;
/** Named constants for {@link AgeCategory} values. */
export declare const AgeCategory: {
    readonly ALL_AGES: 1;
    readonly ALL: 1;
    readonly R15: 2;
    readonly R18: 3;
};
/** Build an {@link AgeCategory} from its numeric value. */
export declare function ageCategoryFromValue(value: number): AgeCategory;
/** Build an {@link AgeCategory} from its name (e.g. `"R18"`). */
export declare function ageCategoryFromName(name: string): AgeCategory;
/** Book type. */
export type BookType = "comic" | "magazine" | "publication" | "oneshot";
/** Named constants for {@link BookType} values. */
export declare const BookType: {
    readonly BOOK: "comic";
    readonly MAGAZINE: "magazine";
    readonly PUBLICATION: "publication";
    readonly STANDALONE: "oneshot";
};
/** Build a {@link BookType} from its value. */
export declare function bookTypeFromValue(value: string): BookType;
/** Work type. */
export type WorkType = "ACN" | "ADV" | "QIZ" | "ICG" | "DNV" | "SCM" | "IMT" | "MNG" | "ET3" | "ETC" | "MUS" | "AMT" | "NRE" | "PBC" | "PZL" | "RPG" | "STG" | "SLN" | "TBL" | "TOL" | "TYP" | "MOV" | "SOU" | "VCM" | "WBT";
/** Named constants for {@link WorkType} values. */
export declare const WorkType: {
    readonly ACTION: "ACN";
    readonly ADVENTURE: "ADV";
    readonly QUIZ: "QIZ";
    readonly CG_ILLUSTRATIONS: "ICG";
    readonly DIGITAL_NOVEL: "DNV";
    readonly GEKIGA: "SCM";
    readonly ILLUST_MATERIALS: "IMT";
    readonly MANGA: "MNG";
    readonly MISCELLANEOUS: "ET3";
    readonly MISCELLANEOUS_GAME: "ETC";
    readonly MUSIC: "MUS";
    readonly MUSIC_MATERIALS: "AMT";
    readonly NOVEL: "NRE";
    readonly PUBLICATION: "PBC";
    readonly PUZZLE: "PZL";
    readonly ROLE_PLAYING: "RPG";
    readonly SHOOTING: "STG";
    readonly SIMULATION: "SLN";
    readonly TABLE: "TBL";
    readonly TOOLS_ACCESSORIES: "TOL";
    readonly TYPING: "TYP";
    readonly VIDEO: "MOV";
    readonly VOICE_ASMR: "SOU";
    readonly VOICED_COMIC: "VCM";
    readonly WEBTOON: "WBT";
};
/** Build a {@link WorkType} from its value. */
export declare function workTypeFromValue(value: string): WorkType;
/** Initialization data for the {@link Work} class. */
export interface WorkFields {
    productId: string;
    siteId: string;
    makerId: string;
    workName: string;
    ageCategory: AgeCategory;
    circle?: string;
    brand?: string;
    publisher?: string;
    workImage?: string;
    registDate?: DateTime;
    workType?: WorkType;
    bookType?: BookType;
    announceDate?: DateTime;
    modifiedDate?: DateTime;
    scenario?: string[];
    illustration?: string[];
    voiceActor?: string[];
    author?: string[];
    music?: string[];
    writer?: string[];
    genre?: string[];
    label?: string;
    event?: string[];
    fileFormat?: string[];
    fileSize?: string;
    language?: string[];
    pageCount?: number;
    description?: string;
    sampleImages?: string[];
    workNameMasked?: string;
    titleName?: string;
    titleNameMasked?: string;
}
/** Field names of {@link WorkFields}. */
export declare const WORK_FIELDS: ReadonlySet<string>;
/** DLsite work (product) class. */
export declare class Work implements WorkFields {
    readonly productId: string;
    readonly siteId: string;
    readonly makerId: string;
    readonly workName: string;
    readonly ageCategory: AgeCategory;
    circle?: string;
    brand?: string;
    publisher?: string;
    workImage?: string;
    registDate?: DateTime;
    workType?: WorkType;
    bookType?: BookType;
    announceDate?: DateTime;
    modifiedDate?: DateTime;
    scenario?: string[];
    illustration?: string[];
    voiceActor?: string[];
    author?: string[];
    music?: string[];
    writer?: string[];
    genre?: string[];
    label?: string;
    event?: string[];
    fileFormat?: string[];
    fileSize?: string;
    language?: string[];
    pageCount?: number;
    description?: string;
    sampleImages?: string[];
    workNameMasked?: string;
    titleName?: string;
    titleNameMasked?: string;
    /** Construct a Work from field data. Fields set to undefined are skipped. */
    constructor(fields: WorkFields);
    /**
     * Construct a Work from a dictionary.
     *
     * Keys must be camelCase field names of {@link WorkFields}; unknown keys
     * are ignored. Values must already be normalized (DateTime, WorkType, etc).
     */
    static fromDict(d: Readonly<Record<string, unknown>>): Work;
    /** Release date. */
    get releaseDate(): DateTime | undefined;
    /** Series name. Set for backwards compatibility. */
    get series(): string | undefined;
}
//# sourceMappingURL=work.d.ts.map