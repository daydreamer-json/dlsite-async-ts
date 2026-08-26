import { describe, expect, it } from "vitest";

import {
  AgeCategory,
  ageCategoryFromName,
  ageCategoryFromValue,
  bookTypeFromValue,
  Work,
  workTypeFromValue,
} from "../src/work.js";
import { DateTime } from "luxon";

describe("age category", () => {
  it("maps values", () => {
    expect(ageCategoryFromValue(1)).toBe(1);
    expect(ageCategoryFromValue(2)).toBe(2);
    expect(ageCategoryFromValue(3)).toBe(3);
  });

  it("rejects invalid values", () => {
    expect(() => ageCategoryFromValue(4)).toThrow();
  });

  it("maps names case-insensitively", () => {
    expect(ageCategoryFromName("R18")).toBe(AgeCategory.R18);
    expect(ageCategoryFromName("all_ages")).toBe(AgeCategory.ALL_AGES);
    expect(ageCategoryFromName("r15")).toBe(AgeCategory.R15);
  });
});

describe("book/work type", () => {
  it("validates book types", () => {
    expect(bookTypeFromValue("comic")).toBe("comic");
    expect(bookTypeFromValue("oneshot")).toBe("oneshot");
    expect(() => bookTypeFromValue("video")).toThrow();
  });

  it("validates work types", () => {
    expect(workTypeFromValue("SOU")).toBe("SOU");
    expect(workTypeFromValue("MNG")).toBe("MNG");
    expect(() => workTypeFromValue("XXX")).toThrow();
  });

  it("keeps named constants", () => {
    expect(AgeCategory.ALL).toBe(1);
    expect(workTypeFromValue("RPG")).toBeDefined();
  });
});

describe("Work", () => {
  const base = new Work({
    productId: "RJ123",
    siteId: "maniax",
    makerId: "RG1234",
    workName: "Test Work",
    ageCategory: 3,
  });

  it("skips undefined fields", () => {
    expect(base.circle).toBeUndefined();
    expect("circle" in base).toBe(false);
  });

  it("merges details via spread", () => {
    const merged = new Work({ ...base, circle: "Circle", pageCount: 10 });
    expect(merged.circle).toBe("Circle");
    expect(merged.pageCount).toBe(10);
    expect(merged.productId).toBe("RJ123");
  });

  it("fromDict filters unknown keys", () => {
    const work = Work.fromDict({
      productId: "BJ1",
      siteId: "comic",
      makerId: "BG2",
      workName: "Manga",
      ageCategory: 1,
      unknownKey: "dropped",
      registDate: DateTime.fromObject({ year: 2021, month: 10, day: 28 }),
    });
    expect(work.workName).toBe("Manga");
    expect((work as unknown as Record<string, unknown>)["unknownKey"]).toBeUndefined();
    expect(work.releaseDate?.year).toBe(2021);
  });

  it("series prefers masked title", () => {
    const masked = new Work({ ...base, titleNameMasked: "Series A", titleName: "Series B" });
    expect(masked.series).toBe("Series A");
    const plain = new Work({ ...base, titleName: "Series B" });
    expect(plain.series).toBe("Series B");
  });
});
