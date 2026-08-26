/** DLsite API classes. */

import ky, { type KyInstance, type Options as KyOptions } from "ky";
import { DateTime } from "luxon";

import { Circle } from "./circle.js";
import {
  createCookieFetch,
  CookieJar,
  type FetchLike,
} from "./cookie-jar.js";
import { AuthenticationError, DlsiteError } from "./exceptions.js";
import { netrcAuthenticators } from "./netrc.js";
import {
  parseCircleHtml,
  parseLoginToken,
  parseWorkHtml,
} from "./scraper.js";
import {
  ageCategoryFromValue,
  bookTypeFromValue,
  workTypeFromValue,
  Work,
  type WorkFields,
} from "./work.js";

export type { FetchLike };

const DEFAULT_TIMEOUT_MS = 30_000;

function mergeSearchParams(
  options: KyOptions,
  extra: Record<string, string>,
): KyOptions {
  if (extra === undefined || Object.keys(extra).length === 0) {
    return options;
  }
  const existing = options.searchParams;
  if (existing === undefined) {
    return { ...options, searchParams: extra };
  }
  const merged = new URLSearchParams(
    existing as string | string[][] | Record<string, string> | URLSearchParams,
  );
  for (const [key, value] of Object.entries(extra)) {
    merged.set(key, value);
  }
  return { ...options, searchParams: merged };
}

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
export class BaseAPI implements AsyncDisposable {
  protected readonly api: KyInstance;

  /** Cookie jar shared by all requests in this session. */
  readonly jar: CookieJar;

  private authed = false;

  constructor(options: BaseAPIOptions = {}) {
    this.jar = new CookieJar();
    const { fetch: fetchFn } = createCookieFetch(
      options.fetch ?? globalThis.fetch,
      this.jar,
    );
    this.api = ky.create({
      fetch: fetchFn,
      retry: { limit: 0 },
      ...(options.timeout !== undefined
        ? { timeout: options.timeout }
        : { timeout: DEFAULT_TIMEOUT_MS }),
      ...(options.headers !== undefined ? { headers: options.headers } : {}),
    });
  }

  /** Whether this session has logged in successfully. */
  get isAuthenticated(): boolean {
    return this.authed;
  }

  /** Close this API session. */
  async close(): Promise<void> {}

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  /** Perform a GET request and return the response. */
  get(url: string | URL, options: KyOptions = {}): Promise<Response> {
    return this.api.get(url, options);
  }

  /** Perform a POST request and return the response. */
  post(url: string | URL, options: KyOptions = {}): Promise<Response> {
    return this.api.post(url, options);
  }

  /**
   * Login to DLsite.
   *
   * Throws:
   *   AuthenticationError: Login failed.
   *
   * Note:
   *   Social media logins are unsupported.
   */
  async login(
    loginId?: string,
    password?: string,
    netrcHost = "dlsite.com",
  ): Promise<void> {
    let id = loginId;
    let pass = password;
    if (id === undefined || pass === undefined) {
      const authenticator = await netrcAuthenticators(netrcHost);
      if (authenticator !== undefined) {
        id ??= authenticator.login;
        pass ??= authenticator.password;
      }
    }
    if (id === undefined || pass === undefined) {
      throw new AuthenticationError("DLsite login_id and password are required.");
    }
    const url = "https://login.dlsite.com/login";
    const tokenResponse = await this.get(url, {
      searchParams: { user: "self" },
    });
    const token = parseLoginToken(await tokenResponse.text());
    const response = await this.post(url, {
      body: new URLSearchParams({
        _token: token,
        login_id: id,
        password: pass,
      }),
    });
    const body = await response.text();
    if (!body.includes("ログイン中です")) {
      throw new AuthenticationError("DLsite login failed.");
    }
    this.authed = true;
  }
}

interface RawProductInfo {
  site_id?: unknown;
  maker_id?: unknown;
  work_name?: unknown;
  age_category?: unknown;
  work_type?: unknown;
  regist_date?: unknown;
  book_type?: { value?: unknown } | null;
  work_image?: unknown;
  work_name_masked?: unknown;
  title_name?: unknown;
  title_name_masked?: unknown;
}

const REGIST_DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new DlsiteError(`Unexpected product info: missing ${field}`);
  }
  return value;
}

/** DLsite API session. */
export class DlsiteAPI extends BaseAPI {
  /** Optional locale (e.g. ``ja_JP``). Defaults to the server default. */
  readonly locale: string | undefined;

  constructor(locale?: string, options: BaseAPIOptions = {}) {
    super(options);
    this.locale = locale;
    this.jar.set({
      name: "adultchecked",
      value: "1",
      domain: ".dlsite.com",
      path: "/",
      secureOnly: false,
    });
  }

  override get(url: string | URL, options: KyOptions = {}): Promise<Response> {
    const extra =
      this.locale !== undefined ? { locale: this.locale } : {};
    return super.get(url, mergeSearchParams(options, extra));
  }

  /** Return the specified work with full details. */
  async getWork(productId: string): Promise<Work> {
    const work = await this.productInfo(productId);
    return this.fillWorkDetails(work);
  }

  /** Return ajax API product info as a minimal Work. */
  async productInfo(productId: string): Promise<Work> {
    const url = "https://www.dlsite.com/maniax/product/info/ajax";
    const response = await this.get(url, {
      searchParams: { product_id: productId },
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (data === null || typeof data !== "object" || !(productId in data)) {
      throw new DlsiteError(`Failed to get product info for ${productId}`);
    }
    const info = data[productId] as RawProductInfo;
    const ageCategory = ageCategoryFromValue(Number(info["age_category"]));
    const workType = workTypeFromValue(String(info["work_type"]));
    let registDate: DateTime | undefined;
    if (typeof info["regist_date"] === "string") {
      const parsed = DateTime.fromFormat(info["regist_date"], REGIST_DATE_FORMAT);
      if (parsed.isValid) {
        registDate = parsed;
      }
    }
    const rawBookType = info["book_type"];
    const bookType =
      typeof rawBookType?.["value"] === "string"
        ? bookTypeFromValue(rawBookType["value"])
        : undefined;
    const optionalString = (value: unknown): string | undefined =>
      typeof value === "string" && value !== "" ? value : undefined;
    const workImage = optionalString(info["work_image"]);
    const workNameMasked = optionalString(info["work_name_masked"]);
    const titleName = optionalString(info["title_name"]);
    const titleNameMasked = optionalString(info["title_name_masked"]);
    return new Work({
      productId,
      siteId: requireString(info["site_id"], "site_id"),
      makerId: requireString(info["maker_id"], "maker_id"),
      workName: requireString(info["work_name"], "work_name"),
      ageCategory,
      workType,
      ...(registDate !== undefined ? { registDate } : {}),
      ...(bookType !== undefined ? { bookType } : {}),
      ...(workImage !== undefined ? { workImage } : {}),
      ...(workNameMasked !== undefined ? { workNameMasked } : {}),
      ...(titleName !== undefined ? { titleName } : {}),
      ...(titleNameMasked !== undefined ? { titleNameMasked } : {}),
    });
  }

  protected async fillWorkDetails(work: Work): Promise<Work> {
    const html = await this.fetchWorkHtml(work);
    if (html === undefined) {
      return work;
    }
    const details = parseWorkHtml(html);
    const fields: WorkFields = { ...work, ...details };
    return new Work(fields);
  }

  private async fetchWorkHtml(work: Work): Promise<string | undefined> {
    for (const typ of ["work", "announce"]) {
      const url =
        `https://www.dlsite.com/${work.siteId}/${typ}` +
        `/=/product_id/${work.productId}.html/`;
      const response = await this.get(url, { throwHttpErrors: false });
      if (response.status === 200) {
        return await response.text();
      }
    }
    return undefined;
  }

  /** Return the specified circle. */
  async getCircle(makerId: string): Promise<Circle> {
    const html = await this.fetchCircleHtml(makerId);
    if (html === undefined) {
      throw new DlsiteError(`Failed to get circle ${makerId}`);
    }
    const info = parseCircleHtml(html);
    return new Circle({ makerId, makerName: info.makerName });
  }

  private async fetchCircleHtml(makerId: string): Promise<string | undefined> {
    const url =
      `https://www.dlsite.com/maniax/circle/profile/=/maker_id/` +
      `${makerId}.html/`;
    const response = await this.get(url, { throwHttpErrors: false });
    if (response.status === 200) {
      return await response.text();
    }
    return undefined;
  }
}
