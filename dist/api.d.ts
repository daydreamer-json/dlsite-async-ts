/** DLsite API classes. */
import { type KyInstance, type Options as KyOptions } from "ky";
import { Circle } from "./circle.js";
import { CookieJar, type FetchLike } from "./cookie-jar.js";
import { Work } from "./work.js";
export type { FetchLike };
/** Options for constructing an API session. */
export interface BaseAPIOptions {
    /** Custom fetch implementation (e.g. for testing). */
    fetch?: FetchLike;
    /** Default headers sent with every request. */
    headers?: Record<string, string>;
    /** Per-request timeout in milliseconds. */
    timeout?: number;
}
/** Base DLsite API session. */
export declare class BaseAPI implements AsyncDisposable {
    protected readonly api: KyInstance;
    /** Cookie jar shared by all requests in this session. */
    readonly jar: CookieJar;
    private authed;
    constructor(options?: BaseAPIOptions);
    /** Whether this session has logged in successfully. */
    get isAuthenticated(): boolean;
    /** Close this API session. */
    close(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
    /** Perform a GET request and return the response. */
    get(url: string | URL, options?: KyOptions): Promise<Response>;
    /** Perform a POST request and return the response. */
    post(url: string | URL, options?: KyOptions): Promise<Response>;
    /**
     * Login to DLsite.
     *
     * Throws:
     *   AuthenticationError: Login failed.
     *
     * Note:
     *   Social media logins are unsupported.
     */
    login(loginId?: string, password?: string, netrcHost?: string): Promise<void>;
}
/** DLsite API session. */
export declare class DlsiteAPI extends BaseAPI {
    /** Optional locale (e.g. ``ja_JP``). Defaults to the server default. */
    readonly locale: string | undefined;
    constructor(locale?: string, options?: BaseAPIOptions);
    get(url: string | URL, options?: KyOptions): Promise<Response>;
    /** Return the specified work with full details. */
    getWork(productId: string): Promise<Work>;
    /** Return ajax API product info as a minimal Work. */
    productInfo(productId: string): Promise<Work>;
    protected fillWorkDetails(work: Work): Promise<Work>;
    private fetchWorkHtml;
    /** Return the specified circle. */
    getCircle(makerId: string): Promise<Circle>;
    private fetchCircleHtml;
}
//# sourceMappingURL=api.d.ts.map