/** Base DLsite exception. */
export declare class DlsiteError extends Error {
    constructor(message?: string);
}
/** Invalid DLsite ID error. */
export declare class InvalidIDError extends DlsiteError {
    constructor(message?: string);
}
/** HTML scraping error. */
export declare class ScrapingError extends DlsiteError {
    constructor(message?: string);
}
/** Authentication error. */
export declare class AuthenticationError extends DlsiteError {
    constructor(message?: string);
}
/** Destination file already exists (mirrors Python's ``FileExistsError``). */
export declare class FileExistsError extends Error {
    readonly code = "EEXIST";
    constructor(path: string);
}
//# sourceMappingURL=exceptions.d.ts.map