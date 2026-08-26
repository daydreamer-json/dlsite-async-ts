/** Base DLsite exception. */
export class DlsiteError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "DlsiteError";
  }
}

/** Invalid DLsite ID error. */
export class InvalidIDError extends DlsiteError {
  constructor(message?: string) {
    super(message);
    this.name = "InvalidIDError";
  }
}

/** HTML scraping error. */
export class ScrapingError extends DlsiteError {
  constructor(message?: string) {
    super(message);
    this.name = "ScrapingError";
  }
}

/** Authentication error. */
export class AuthenticationError extends DlsiteError {
  constructor(message?: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

/** Destination file already exists (mirrors Python's ``FileExistsError``). */
export class FileExistsError extends Error {
  readonly code = "EEXIST";

  constructor(path: string) {
    super(`File already exists: ${path}`);
    this.name = "FileExistsError";
  }
}
