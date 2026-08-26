/** Shared test helpers: mock fetch + response builders. */

export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: string | null;
}

export type FetchHandler = (
  request: Request,
) => Response | Promise<Response>;

export function mockFetch(handler: FetchHandler): {
  fetch: typeof globalThis.fetch;
  calls: RecordedRequest[];
} {
  const calls: RecordedRequest[] = [];
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const rawBody =
      request.body === null ? null : await new Response(request.body).text();
    calls.push({
      url: new URL(request.url),
      method: request.method,
      headers: request.headers,
      body: rawBody,
    });
    // Rebuild a request with an unconsumed body for the handler.
    const handlerRequest =
      rawBody !== null && request.method !== "GET" && request.method !== "HEAD"
        ? new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: rawBody,
          })
        : new Request(request.url, {
            method: request.method,
            headers: request.headers,
          });
    return handler(handlerRequest);
  };
  return { fetch: fetchImpl, calls };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html" },
  });
}

/** Respond with a redirect carrying cookies, like a login hop. */
export function redirectResponse(
  location: string,
  setCookies: string[] = [],
  status = 302,
): Response {
  const headers = new Headers({ location });
  for (const cookie of setCookies) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { status, headers });
}

export function bytesResponse(bytes: Uint8Array, contentType = ""): Response {
  const copy = new Uint8Array(bytes);
  return new Response(copy.buffer as ArrayBuffer, {
    status: 200,
    ...(contentType !== "" ? { headers: { "content-type": contentType } } : {}),
  });
}
