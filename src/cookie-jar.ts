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

function hostMatches(host: string, domain: string): boolean {
  if (domain.startsWith(".")) {
    return host.endsWith(domain);
  }
  return host === domain;
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) {
    return true;
  }
  const prefix = cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`;
  return requestPath.startsWith(prefix);
}

function isExpired(cookie: StoredCookie, now: number): boolean {
  return cookie.expiresAt !== null && cookie.expiresAt <= now;
}

/** Parse a set-cookie header value into attributes (best effort). */
function parseSetCookie(
  header: string,
  url: URL,
  now: number,
): StoredCookie | undefined {
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
  let expiresAt: number | null = null;
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

  const cookie: StoredCookie = {
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
  private readonly cookies = new Map<string, StoredCookie>();

  /** Store a pre-built cookie (used to seed defaults like `adultchecked`). */
  set(cookie: Omit<StoredCookie, "expiresAt">, now: number = Date.now()): void {
    const stored: StoredCookie = { ...cookie, expiresAt: null };
    if (isExpired(stored, now)) {
      this.cookies.delete(CookieJar.key(stored));
      return;
    }
    this.cookies.set(CookieJar.key(stored), stored);
  }

  /** Store a raw set-cookie header value received for the given URL. */
  setCookieFromHeader(header: string, url: URL): void {
    const cookie = parseSetCookie(header, url, Date.now());
    if (cookie === undefined) {
      return;
    }
    this.cookies.set(CookieJar.key(cookie), cookie);
  }

  /** Return all cookies applicable to the URL as a `Cookie` header value. */
  getCookieHeader(url: URL): string | undefined {
    const now = Date.now();
    const parts: string[] = [];
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
  *entries(): IterableIterator<Readonly<StoredCookie>> {
    for (const cookie of this.cookies.values()) {
      yield cookie;
    }
  }

  private static key(cookie: Pick<StoredCookie, "domain" | "path" | "name">): string {
    return `${cookie.domain}|${cookie.path}|${cookie.name}`;
  }
}

export type FetchLike = typeof globalThis.fetch;

interface RequestParts {
  url: URL;
  method: string;
  headers: Headers;
  body: BodyInit | null;
}

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20;

async function normalizeRequest(
  input: Parameters<FetchLike>[0],
  init?: RequestInit,
): Promise<RequestParts> {
  if (typeof input === "string" || input instanceof URL) {
    return {
      url: new URL(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body ?? null,
    };
  }
  const request = input;
  let body: BodyInit | null = init?.body ?? null;
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
export function createCookieFetch(
  fetchImpl: FetchLike = globalThis.fetch,
  jar: CookieJar = new CookieJar(),
): {
  fetch: FetchLike;
  jar: CookieJar;
} {
  const fetchWithCookies: FetchLike = async (input, init) => {
    let current = await normalizeRequest(input, init);
    const signal = init?.signal;

    for (let redirects = 0; ; redirects += 1) {
      if (redirects > MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }

      const headers = new Headers(current.headers);
      headers.delete("cookie");
      const cookieHeader = jar.getCookieHeader(current.url);
      if (cookieHeader !== undefined) {
        headers.set("cookie", cookieHeader);
      }

      const response = await fetchImpl(
        new Request(current.url.href, {
          method: current.method,
          headers,
          body: current.body,
          redirect: "manual",
          ...(signal !== undefined ? { signal } : {}),
        }),
      );

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
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) &&
          method !== "GET" &&
          method !== "HEAD")
      ) {
        method = "GET";
        body = null;
      }
      current = { url: nextUrl, method, headers: current.headers, body };
    }
  };

  return { fetch: fetchWithCookies, jar };
}
