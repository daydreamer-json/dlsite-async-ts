import { describe, expect, it } from "vitest";

import { InvalidIDError } from "../src/exceptions.js";
import { Circle, makerTypeFromMakerId } from "../src/circle.js";

describe("makerTypeFromMakerId", () => {
  it.each([
    ["RG12345", "circle"],
    ["BG12345", "publisher"],
    ["VG12345", "brand"],
  ] as const)("maps %s to %s", (makerId, expected) => {
    expect(makerTypeFromMakerId(makerId)).toBe(expected);
  });

  it("rejects unknown prefixes", () => {
    expect(() => makerTypeFromMakerId("XX123")).toThrow(InvalidIDError);
  });
});

describe("Circle", () => {
  it("exposes maker_type", () => {
    const circle = new Circle({ makerId: "RG12345", makerName: "Test Circle" });
    expect(circle.makerType).toBe("circle");
  });

  it("constructs from dict ignoring unknown keys", () => {
    const circle = Circle.fromDict({
      makerId: "BG99999",
      makerName: "Brand Co",
      extra: "ignored",
    });
    expect(circle.makerId).toBe("BG99999");
    expect(circle.makerName).toBe("Brand Co");
    expect(circle.makerType).toBe("publisher");
  });
});
