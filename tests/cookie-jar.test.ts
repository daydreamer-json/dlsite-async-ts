import { describe, expect, it } from "vitest";

import { CookieJar, createCookieFetch } from "../src/cookie-jar.js";
import { redirectResponse } from "./helpers.js";

function url(input: string): URL {
  return new URL(input);
}

describe("CookieJar", () => {
  it("stores and sends cookies", () => {
    const jar = new CookieJar();
    jar.setCookieFromHeader(
      "session=abc123; Path=/; Domain=.dlsite.com",
      url("https://www.dlsite.com/login"),
    );
    expect(
      jar.getCookieHeader(url("https://www.dlsite.com/maniax/")),
    ).toBe("session=abc123");
    // suffix domain match covers subdomains
    expect(jar.getCookieHeader(url("https://play.dlsite.com/"))).toBe(
      "session=abc123",
    );
    // other domains don't get the cookie
    expect(jar.getCookieHeader(url("https://example.com/"))).toBeUndefined();
  });

  it("respects host-only cookies", () => {
    const jar = new CookieJar();
    jar.setCookieFromHeader("a=1", url("https://login.dlsite.com/x"));
    expect(jar.getCookieHeader(url("https://www.dlsite.com/"))).toBeUndefined();
    expect(jar.getCookieHeader(url("https://login.dlsite.com/y"))).toBe("a=1");
  });

  it("drops expired cookies", () => {
    const jar = new CookieJar();
    jar.setCookieFromHeader(
      "old=1; Max-Age=-10",
      url("https://dlsite.com/"),
    );
    jar.set({ name: "gone", value: "2", domain: ".dlsite.com", path: "/", secureOnly: false }, Date.now() - 1000);
    jar.setCookieFromHeader(
      `fresh=3; Expires=${new Date(Date.now() + 60_000).toUTCString()}`,
      url("https://dlsite.com/"),
    );
    expect(jar.getCookieHeader(url("https://dlsite.com/"))).toBe("fresh=3");
  });
});

describe("createCookieFetch", () => {
  it("harvests cookies across redirects", async () => {
    let hop = 0;
    const seen: Array<string | null> = [];
    const { fetch } = createCookieFetch(async (input, init) => {
      const request = new Request(input, init);
      if (hop === 0) {
        hop += 1;
        return redirectResponse("https://www.dlsite.com/home", [
          "session=xyz; Domain=.dlsite.com; Path=/",
        ]);
      }
      seen.push(request.headers.get("cookie"));
      return new Response("ok");
    });

    const response = await fetch("https://login.dlsite.com/login");
    await response.text();
    expect(seen[0]).toContain("session=xyz");
  });

  it("does not leak cookies cross-domain on redirect", async () => {
    let hop = 0;
    const seen: Array<string | null> = [];
    const { fetch } = createCookieFetch(async (input, init) => {
      const request = new Request(input, init);
      if (hop === 0) {
        hop += 1;
        return redirectResponse("https://evil.example.com/", [
          "secret=1; Domain=.dlsite.com; Path=/",
        ]);
      }
      seen.push(request.headers.get("cookie"));
      return new Response("ok");
    });

    const response = await fetch("https://www.dlsite.com/");
    await response.text();
    // No cookie header may be sent to the foreign host.
    expect(seen[0] ?? "").not.toContain("secret=1");
  });

  it("converts POST to GET on 302 redirect and drops body", async () => {
    const requests: string[] = [];
    const { fetch } = createCookieFetch(async (input, init) => {
      const request = new Request(input, init);
      requests.push(`${request.method} ${request.url}`);
      if (request.url.includes("login")) {
        return redirectResponse("https://example.com/done");
      }
      return new Response("done");
    });

    await fetch("https://example.com/login", {
      method: "POST",
      body: "a=1",
    });
    expect(requests).toEqual([
      "POST https://example.com/login",
      "GET https://example.com/done",
    ]);
  });
});
