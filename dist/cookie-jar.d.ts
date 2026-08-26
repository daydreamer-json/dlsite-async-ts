/**
 * Minimal cookie jar with domain/path matching and a redirect-following
 * fetch wrapper, so that session cookies survive login redirects the way
 * an HTTP session object would.
 */
interface StoredCookie {
    name: string;
    value: string;
    /** Exact host, or dotted suffix domain such as `.dlsite.com`. */
    domain: string;
    path: string;
    /** Expiry as epoch ms, or null for session cookies. */
    expiresAt: number | null;
    secureOnly: boolean;
}
/** A simple in-memory cookie jar. */
export declare class CookieJar {
    private readonly cookies;
    /** Store a pre-built cookie (used to seed defaults like `adultchecked`). */
    set(cookie: Omit<StoredCookie, "expiresAt">, now?: number): void;
    /** Store a raw set-cookie header value received for the given URL. */
    setCookieFromHeader(header: string, url: URL): void;
    /** Return all cookies applicable to the URL as a `Cookie` header value. */
    getCookieHeader(url: URL): string | undefined;
    /** Iterate stored cookies (e.g. for assertions). */
    entries(): IterableIterator<Readonly<StoredCookie>>;
    private static key;
}
export type FetchLike = typeof globalThis.fetch;
/**
 * Create a fetch-like function that persists cookies between requests and
 * follows redirects manually, harvesting cookies on every hop.
 *
 * When `jar` is omitted a fresh jar is created and returned alongside.
 */
export declare function createCookieFetch(fetchImpl?: FetchLike, jar?: CookieJar): {
    fetch: FetchLike;
    jar: CookieJar;
};
export {};
//# sourceMappingURL=cookie-jar.d.ts.map