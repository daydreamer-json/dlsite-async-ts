/**
 * Minimal cookie jar with domain/path matching and a redirect-following
 * fetch wrapper, so that session cookies survive login redirects the way
 * an HTTP session object would.
 */
function hostMatches(host, domain) {
    if (domain.startsWith(".")) {
        return host.endsWith(domain);
    }
    return host === domain;
}
function pathMatches(requestPath, cookiePath) {
    if (requestPath === cookiePath) {
        return true;
    }
    const prefix = cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`;
    return requestPath.startsWith(prefix);
}
function isExpired(cookie, now) {
    return cookie.expiresAt !== null && cookie.expiresAt <= now;
}
/** Parse a set-cookie header value into attributes (best effort). */
function parseSetCookie(header, url, now) {
    const separator = header.indexOf("=");
    if (separator <= 0) {
        return undefined;
    }
    const name = header.slice(0, separator).trim();
    const rest = header.slice(separator + 1);
    const end = rest.indexOf(";");
    const value = (end === -1 ? rest : rest.slice(0, end)).trim();
    const attributes = end === -1 ? [] : rest.slice(end + 1).split(";");
    let domain = url.hostname.toLowerCase();
    let path = "/";
    let expiresAt = null;
    let secureOnly = false;
    for (const attribute of attributes) {
        const eq = attribute.indexOf("=");
        const key = (eq === -1 ? attribute : attribute.slice(0, eq))
            .trim()
            .toLowerCase();
        const val = eq === -1 ? "" : attribute.slice(eq + 1).trim();
        switch (key) {
            case "domain": {
                if (val !== "") {
                    domain = val.toLowerCase().startsWith(".")
                        ? val.toLowerCase()
                        : `.${val.toLowerCase()}`;
                }
                break;
            }
            case "path": {
                path = val === "" ? "/" : val;
                break;
            }
            case "expires": {
                const t = Date.parse(val);
                if (!Number.isNaN(t)) {
                    expiresAt = t;
                }
                break;
            }
            case "max-age": {
                const seconds = Number.parseInt(val, 10);
                if (!Number.isNaN(seconds)) {
                    expiresAt = now + seconds * 1000;
                }
                break;
            }
            case "secure": {
                secureOnly = true;
                break;
            }
            default: {
                break;
            }
        }
    }
    const cookie = {
        name,
        value,
        domain,
        path,
        expiresAt,
        secureOnly,
    };
    if (isExpired(cookie, now)) {
        return undefined;
    }
    return cookie;
}
/** A simple in-memory cookie jar. */
export class CookieJar {
    constructor() {
        this.cookies = new Map();
    }
    /** Store a pre-built cookie (used to seed defaults like `adultchecked`). */
    set(cookie, now = Date.now()) {
        const stored = { ...cookie, expiresAt: null };
        if (isExpired(stored, now)) {
            this.cookies.delete(CookieJar.key(stored));
            return;
        }
        this.cookies.set(CookieJar.key(stored), stored);
    }
    /** Store a raw set-cookie header value received for the given URL. */
    setCookieFromHeader(header, url) {
        const cookie = parseSetCookie(header, url, Date.now());
        if (cookie === undefined) {
            return;
        }
        this.cookies.set(CookieJar.key(cookie), cookie);
    }
    /** Return all cookies applicable to the URL as a `Cookie` header value. */
    getCookieHeader(url) {
        const now = Date.now();
        const parts = [];
        for (const [key, cookie] of this.cookies) {
            if (isExpired(cookie, now)) {
                this.cookies.delete(key);
                continue;
            }
            if (!hostMatches(url.hostname.toLowerCase(), cookie.domain)) {
                continue;
            }
            if (!pathMatches(url.pathname, cookie.path)) {
                continue;
            }
            if (cookie.secureOnly && url.protocol !== "https:") {
                continue;
            }
            parts.push(`${cookie.name}=${cookie.value}`);
        }
        if (parts.length === 0) {
            return undefined;
        }
        return parts.join("; ");
    }
    /** Iterate stored cookies (e.g. for assertions). */
    *entries() {
        for (const cookie of this.cookies.values()) {
            yield cookie;
        }
    }
    static key(cookie) {
        return `${cookie.domain}|${cookie.path}|${cookie.name}`;
    }
}
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20;
async function normalizeRequest(input, init) {
    if (typeof input === "string" || input instanceof URL) {
        return {
            url: new URL(input),
            method: init?.method ?? "GET",
            headers: new Headers(init?.headers),
            body: init?.body ?? null,
        };
    }
    const request = input;
    let body = init?.body ?? null;
    if (init?.body === undefined && request.method !== "GET" && request.method !== "HEAD") {
        // ponytail: buffers request bodies fully in memory so they can be
        // replayed across redirects; fine for this library's small form posts
        body =
            request.body === null
                ? null
                : await new Response(request.body).text();
    }
    return {
        url: new URL(request.url),
        method: init?.method ?? request.method,
        headers: new Headers(init?.headers ?? request.headers),
        body,
    };
}
/**
 * Create a fetch-like function that persists cookies between requests and
 * follows redirects manually, harvesting cookies on every hop.
 *
 * When `jar` is omitted a fresh jar is created and returned alongside.
 */
export function createCookieFetch(fetchImpl = globalThis.fetch, jar = new CookieJar()) {
    const fetchWithCookies = async (input, init) => {
        let current = await normalizeRequest(input, init);
        const signal = init?.signal;
        for (let redirects = 0;; redirects += 1) {
            if (redirects > MAX_REDIRECTS) {
                throw new Error("Too many redirects");
            }
            const headers = new Headers(current.headers);
            headers.delete("cookie");
            const cookieHeader = jar.getCookieHeader(current.url);
            if (cookieHeader !== undefined) {
                headers.set("cookie", cookieHeader);
            }
            const response = await fetchImpl(new Request(current.url.href, {
                method: current.method,
                headers,
                body: current.body,
                redirect: "manual",
                ...(signal !== undefined ? { signal } : {}),
            }));
            const setCookies = response.headers.getSetCookie?.() ?? [];
            for (const header of setCookies) {
                jar.setCookieFromHeader(header, current.url);
            }
            if (!REDIRECT_STATUSES.has(response.status)) {
                return response;
            }
            const location = response.headers.get("location");
            if (location === null) {
                return response;
            }
            const nextUrl = new URL(location, current.url);
            let { method, body } = current;
            if (response.status === 303 ||
                ((response.status === 301 || response.status === 302) &&
                    method !== "GET" &&
                    method !== "HEAD")) {
                method = "GET";
                body = null;
            }
            current = { url: nextUrl, method, headers: current.headers, body };
        }
    };
    return { fetch: fetchWithCookies, jar };
}
//# sourceMappingURL=cookie-jar.js.map