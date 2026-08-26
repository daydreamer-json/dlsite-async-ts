/** Base DLsite exception. */
export class DlsiteError extends Error {
    constructor(message) {
        super(message);
        this.name = "DlsiteError";
    }
}
/** Invalid DLsite ID error. */
export class InvalidIDError extends DlsiteError {
    constructor(message) {
        super(message);
        this.name = "InvalidIDError";
    }
}
/** HTML scraping error. */
export class ScrapingError extends DlsiteError {
    constructor(message) {
        super(message);
        this.name = "ScrapingError";
    }
}
/** Authentication error. */
export class AuthenticationError extends DlsiteError {
    constructor(message) {
        super(message);
        this.name = "AuthenticationError";
    }
}
/** Destination file already exists (mirrors Python's ``FileExistsError``). */
export class FileExistsError extends Error {
    constructor(path) {
        super(`File already exists: ${path}`);
        this.code = "EEXIST";
        this.name = "FileExistsError";
    }
}
//# sourceMappingURL=exceptions.js.map