/** Utilities. */
import { DateTime } from "luxon";
import { InvalidIDError } from "./exceptions.js";
const PRODUCT_RE = /(?<!\w)[BRV]J\d+/i;
const MAKER_RE = /(?<!\w)[BRV]G\d+/i;
/**
 * Find a DLsite product ID in a string.
 *
 * Throws:
 *   InvalidIDError: `s` did not contain a valid product ID.
 */
export function findProductId(s) {
    const m = PRODUCT_RE.exec(s);
    if (m !== null && m[0] !== undefined) {
        return m[0].toUpperCase();
    }
    throw new InvalidIDError(`No DLsite product ID in string: ${s}`);
}
/**
 * Find a DLsite maker ID in a string.
 *
 * Throws:
 *   InvalidIDError: `s` did not contain a valid maker ID.
 */
export function findMakerId(s) {
    const m = MAKER_RE.exec(s);
    if (m !== null && m[0] !== undefined) {
        return m[0].toUpperCase();
    }
    throw new InvalidIDError(`No DLsite maker ID in string: ${s}`);
}
/**
 * Parse an ISO format timestamp, tolerating missing timezone separators.
 *
 * Throws:
 *   Error: `timestamp` could not be parsed.
 */
export function fromIsoFormat(timestamp) {
    const iso = DateTime.fromISO(timestamp);
    if (iso.isValid) {
        return iso;
    }
    const sql = DateTime.fromSQL(timestamp);
    if (sql.isValid) {
        return sql;
    }
    throw new Error(`Invalid timestamp: ${timestamp}`);
}
//# sourceMappingURL=utils.js.map