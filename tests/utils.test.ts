import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import { InvalidIDError } from "../src/exceptions.js";
import { findMakerId, findProductId, fromIsoFormat } from "../src/utils.js";

describe("findProductId", () => {
  it.each([
    ["RJ123", "RJ123"],
    ["rj123456", "RJ123456"],
    ["https://www.dlsite.com/maniax/work/=/product_id/RJ01047213.html", "RJ01047213"],
    ["VJ012345", "VJ012345"],
    ["BJ987654", "BJ987654"],
    ["work RJ123 please", "RJ123"],
  ])("finds %s -> %s", (input, expected) => {
    expect(findProductId(input)).toBe(expected);
  });

  it("does not match when preceded by a word character", () => {
    expect(() => findProductId("xRJ123")).toThrow(InvalidIDError);
  });

  it.each(["no id here", "", "RJ", "12345"])("rejects %s", (input) => {
    expect(() => findProductId(input)).toThrow(InvalidIDError);
  });
});

describe("findMakerId", () => {
  it.each([
    ["RG123", "RG123"],
    ["https://www.dlsite.com/maniax/circle/profile/=/maker_id/RG51931.html", "RG51931"],
    ["VG01234", "VG01234"],
    ["BG123456", "BG123456"],
    ["maker bg12345 site", "BG12345"],
  ])("finds %s -> %s", (input, expected) => {
    expect(findMakerId(input)).toBe(expected);
  });

  it("does not match product IDs", () => {
    expect(() => findMakerId("RJ123")).toThrow(InvalidIDError);
  });
});

describe("fromIsoFormat", () => {
  it("parses ISO timestamps", () => {
    const dt = fromIsoFormat("2014-07-07T04:47:06+00:00");
    expect(dt.toUTC().toISO()).toContain("2014-07-07T04:47:06");
  });

  it("parses fractional seconds", () => {
    expect(fromIsoFormat("2022-01-01T00:00:00.500+09:00").isValid).toBe(true);
  });

  it("throws on invalid input", () => {
    expect(() => fromIsoFormat("not a date")).toThrow();
  });
});

describe("luxon integration", () => {
  it("formats datetimes deterministically", () => {
    const dt = DateTime.fromFormat("2022年01月01日", "yyyy'年'MM'月'dd'日'", {
      locale: "en",
    });
    expect(dt.year).toBe(2022);
    expect(dt.month).toBe(1);
    expect(dt.day).toBe(1);
  });
});
