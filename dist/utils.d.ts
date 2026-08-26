/** Utilities. */
import { DateTime } from "luxon";
/**
 * Find a DLsite product ID in a string.
 *
 * Throws:
 *   InvalidIDError: `s` did not contain a valid product ID.
 */
export declare function findProductId(s: string): string;
/**
 * Find a DLsite maker ID in a string.
 *
 * Throws:
 *   InvalidIDError: `s` did not contain a valid maker ID.
 */
export declare function findMakerId(s: string): string;
/**
 * Parse an ISO format timestamp, tolerating missing timezone separators.
 *
 * Throws:
 *   Error: `timestamp` could not be parsed.
 */
export declare function fromIsoFormat(timestamp: string): DateTime;
//# sourceMappingURL=utils.d.ts.map