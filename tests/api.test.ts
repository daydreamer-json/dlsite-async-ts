import { describe, expect, it } from "vitest";

import { AuthenticationError, DlsiteError } from "../src/exceptions.js";
import { DlsiteAPI } from "../src/api.js";
import {
  htmlResponse,
  jsonResponse,
  mockFetch,
  redirectResponse,
} from "./helpers.js";

const WORK_TEST_HTML = `
<html>
<head />
<body>
<table id="work_maker">
  <tbody>
    <tr>
      <th>サークル名</th>
      <td>
        <span itemprop="brand" class="maker_name">
          <a href="#">Test Circle</a>
        </span>
        <div class="btn_follow">
          <span class="add_follow">
            <a href="/maniax/mypage/followlist/add/">フォローする</a>
          </span>
        </div>
      </td>
    </tr>
  </tbody>
</table>
<table cellspacing="0" id="work_outline">
  <tbody>
    <tr>
      <th>更新情報</th>
      <td>
        2022年01月01日
        <div class="btn_ver_up"><a href="#version_up">更新情報</a></div>
      </td>
    </tr>
    <tr>
      <th>シリーズ名</th>
      <td><a href="#">Test Series</a></td>
    </tr>
    <tr>
      <th>声優</th>
      <td>
        <a href="#">Test Seiyuu 1</a> /
        <a href="#">Test Seiyuu 2</a>
      </td>
    </tr>
    <tr>
      <th>ページ数</th>
      <td>123</td>
    </tr>
    <tr>
      <th>作品形式</th>
      <td>
        <div class="work_genre" id="category_type">
          <a href="#"><span class="icon_SOU" title="ボイス・ASMR">ボイス・ASMR</span></a>
        </div>
      </td>
    </tr>
  </tbody>
</table>
<meta name="description" content="Test description &quot;DLsite&quot; is for sale at DLsite!">
</body>
</html>
`;

const CIRCLE_TEST_HTML = `
<html>
<head />
<body>
<table cellspacing="0">
  <tbody>
    <tr>
      <th>サークル名</th>
      <td>
        <div class="prof_maker_box">
          <strong class="prof_maker_name">Test Circle</strong>
        </div>
      </td>
    </tr>
  </tbody>
</table>
</body>
</html>
`;

function makeApi(
  handler: Parameters<typeof mockFetch>[0],
): DlsiteAPI {
  const { fetch } = mockFetch(handler);
  return new DlsiteAPI(undefined, { fetch });
}

describe("DlsiteAPI", () => {
  it("sets the adultchecked cookie", async () => {
    let cookie: string | null = null;
    const api = makeApi((request) => {
      cookie = request.headers.get("cookie");
      return jsonResponse({});
    });
    await api.productInfo("RJ123").catch(() => {});
    expect(cookie).toContain("adultchecked=1");
    await api.close();
  });

  it("merges the locale query param", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse({}));
    const api = new DlsiteAPI("en_US", { fetch });
    await api.get("https://www.dlsite.com/foo/").catch(() => {});
    await api
      .get("https://www.dlsite.com/bar/", { searchParams: { q: "1" } })
      .catch(() => {});
    expect(calls[0]?.url.searchParams.get("locale")).toBe("en_US");
    expect(calls[1]?.url.searchParams.get("q")).toBe("1");
    expect(calls[1]?.url.searchParams.get("locale")).toBe("en_US");
    await api.close();
  });

  it("parses ajax product info", async () => {
    const api = makeApi((request) => {
      expect(request.url).toContain("/product/info/ajax");
      return jsonResponse({
        RJ1234: {
          site_id: "maniax",
          maker_id: "RG1234",
          work_name: "Test Work",
          age_category: 3,
          work_type: "SOU",
          regist_date: "2022-01-01 00:00:00",
          book_type: { value: "comic" },
        },
      });
    });
    const work = await api.productInfo("RJ1234");
    expect(work.productId).toBe("RJ1234");
    expect(work.siteId).toBe("maniax");
    expect(work.makerId).toBe("RG1234");
    expect(work.workName).toBe("Test Work");
    expect(work.ageCategory).toBe(3);
    expect(work.workType).toBe("SOU");
    expect(work.registDate?.year).toBe(2022);
    expect(work.bookType).toBe("comic");
    await api.close();
  });

  it("raises DlsiteError for missing product info", async () => {
    const api = makeApi(() => jsonResponse({}));
    await expect(api.productInfo("RJ9999")).rejects.toThrow(DlsiteError);
    await api.close();
  });

  it("fills work details from HTML", async () => {
    const info = {
      RJ1234: {
        site_id: "maniax",
        maker_id: "RG1234",
        work_name: "Test Work",
        age_category: 3,
        work_type: "SOU",
        regist_date: "2022-01-01 00:00:00",
        book_type: { value: "comic" },
      },
    };
    const api = makeApi((request) =>
      request.url.includes("/ajax")
        ? jsonResponse(info)
        : htmlResponse(WORK_TEST_HTML),
    );
    const work = await api.getWork("RJ1234");
    expect(work.circle).toBe("Test Circle");
    expect(work.modifiedDate?.toISODate()).toBe("2022-01-01");
    expect(work.pageCount).toBe(123);
    expect(work.voiceActor).toEqual(["Test Seiyuu 1", "Test Seiyuu 2"]);
    expect(work.titleNameMasked).toBe("Test Series");
    expect(work.series).toBe("Test Series");
    expect(work.description).toBe("Test description");
    await api.close();
  });

  it("falls back to the announce page when work page misses", async () => {
    const info = {
      RJ1234: {
        site_id: "maniax",
        maker_id: "RG1234",
        work_name: "Announced Work",
        age_category: 3,
        work_type: "SOU",
      },
    };
    const paths: string[] = [];
    const api = makeApi((request) => {
      if (request.url.includes("/ajax")) {
        return jsonResponse(info);
      }
      paths.push(request.url);
      return request.url.includes("/announce")
        ? htmlResponse("<html><body></body></html>")
        : new Response("not found", { status: 404 });
    });
    const work = await api.getWork("RJ1234");
    expect(paths.some((p) => p.includes("/announce"))).toBe(true);
    expect(work.workName).toBe("Announced Work");
    await api.close();
  });

  it("parses circle HTML", async () => {
    const api = makeApi(() => htmlResponse(CIRCLE_TEST_HTML));
    const circle = await api.getCircle("RG1234");
    expect(circle.makerId).toBe("RG1234");
    expect(circle.makerName).toBe("Test Circle");
    expect(circle.makerType).toBe("circle");
    await api.close();
  });

  it("raises DlsiteError when circle fetch fails", async () => {
    const api = makeApi(() => new Response("nope", { status: 404 }));
    await expect(api.getCircle("RG1234")).rejects.toThrow(DlsiteError);
    await api.close();
  });

  it("logs in with credentials and keeps session cookies", async () => {
    const postBodies: Array<string | null> = [];
    const cookiesAfterLogin: Array<string | null> = [];
    const api = new DlsiteAPI(undefined, {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.method === "POST") {
          postBodies.push(await new Response(request.body).text());
          return redirectResponse(
            "https://login.dlsite.com/home",
            ["sessionid=abc; Domain=.dlsite.com; Path=/"],
          );
        }
        if (request.url === "https://login.dlsite.com/home") {
          // Redirect target should already carry the session cookie.
          cookiesAfterLogin.push(request.headers.get("cookie"));
          return htmlResponse("ログイン中です");
        }
        return htmlResponse('<form><input name="_token" value="tok3n"></form>');
      },
    });
    await api.login("user", "pass");
    expect(api.isAuthenticated).toBe(true);
    expect(postBodies).toHaveLength(1);
    const body = postBodies[0] ?? "";
    expect(body).toContain("_token=tok3n");
    expect(body).toContain("login_id=user");
    expect(body).toContain("password=pass");
    expect(cookiesAfterLogin[0]).toContain("sessionid=abc");

    // Later requests keep sending the session cookie.
    let laterCookie: string | null = null;
    const api2 = new DlsiteAPI(undefined, {
      fetch: async (input, init) => {
        laterCookie = new Request(input, init).headers.get("cookie");
        return jsonResponse({});
      },
    });
    api2.jar.set({
      name: "sessionid",
      value: "abc",
      domain: ".dlsite.com",
      path: "/",
      secureOnly: false,
    });
    await api2.get("https://www.dlsite.com/work/").catch(() => {});
    expect(laterCookie).toContain("sessionid=abc");

    await api.close();
    await api2.close();
  });

  it("throws AuthenticationError on failed login", async () => {
    const api = new DlsiteAPI(undefined, {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.method === "POST") {
          return htmlResponse("エラー");
        }
        return htmlResponse('<input name="_token" value="t">');
      },
    });
    await expect(api.login("user", "bad")).rejects.toThrow(AuthenticationError);
    await api.close();
  });
  it("requires credentials from somewhere", async () => {
    const api = new DlsiteAPI(undefined, {
      fetch: async () => htmlResponse(""),
    });
    await expect(api.login()).rejects.toThrow(AuthenticationError);
    await api.close();
  });
});
