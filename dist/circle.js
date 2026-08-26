/** DLsite circle classes. */
import { InvalidIDError } from "./exceptions.js";
/**
 * Return MakerType from maker_id.
 *
 * Throws:
 *   InvalidIDError: `makerId` was invalid.
 */
export function makerTypeFromMakerId(makerId) {
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
    constructor(fields) {
        this.makerId = fields.makerId;
        this.makerName = fields.makerName;
    }
    /** Construct a Circle from a dictionary (unknown keys are ignored). */
    static fromDict(d) {
        return new Circle({
            makerId: d["makerId"],
            makerName: d["makerName"],
        });
    }
    /** Return maker type for this circle. */
    get makerType() {
        return makerTypeFromMakerId(this.makerId);
    }
}
//# sourceMappingURL=circle.js.map