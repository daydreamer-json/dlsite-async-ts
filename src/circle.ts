/** DLsite circle classes. */

import { InvalidIDError } from "./exceptions.js";

/** Maker type. */
export type MakerType = "brand" | "circle" | "publisher";

/**
 * Return MakerType from maker_id.
 *
 * Throws:
 *   InvalidIDError: `makerId` was invalid.
 */
export function makerTypeFromMakerId(makerId: string): MakerType {
  const prefix = makerId.slice(0, 2);
  if (prefix === "RG") {
    return "circle";
  }
  if (prefix === "BG") {
    return "publisher";
  }
  if (prefix === "VG") {
    return "brand";
  }
  throw new InvalidIDError(`Invalid maker ID ${makerId}`);
}

/** DLsite circle (maker) class. */
export class Circle {
  readonly makerId: string;
  readonly makerName: string;

  constructor(fields: { makerId: string; makerName: string }) {
    this.makerId = fields.makerId;
    this.makerName = fields.makerName;
  }

  /** Construct a Circle from a dictionary (unknown keys are ignored). */
  static fromDict(d: Readonly<Record<string, unknown>>): Circle {
    return new Circle({
      makerId: d["makerId"] as string,
      makerName: d["makerName"] as string,
    });
  }

  /** Return maker type for this circle. */
  get makerType(): MakerType {
    return makerTypeFromMakerId(this.makerId);
  }
}
