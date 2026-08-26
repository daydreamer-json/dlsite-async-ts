/** DLsite circle classes. */
/** Maker type. */
export type MakerType = "brand" | "circle" | "publisher";
/**
 * Return MakerType from maker_id.
 *
 * Throws:
 *   InvalidIDError: `makerId` was invalid.
 */
export declare function makerTypeFromMakerId(makerId: string): MakerType;
/** DLsite circle (maker) class. */
export declare class Circle {
    readonly makerId: string;
    readonly makerName: string;
    constructor(fields: {
        makerId: string;
        makerName: string;
    });
    /** Construct a Circle from a dictionary (unknown keys are ignored). */
    static fromDict(d: Readonly<Record<string, unknown>>): Circle;
    /** Return maker type for this circle. */
    get makerType(): MakerType;
}
//# sourceMappingURL=circle.d.ts.map