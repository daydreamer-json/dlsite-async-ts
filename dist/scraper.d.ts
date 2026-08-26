/** HTML scraper. */
import type { WorkFields } from "./work.js";
/** Parse work HTML into partial work details. */
export declare function parseWorkHtml(content: string): Partial<WorkFields>;
export interface CircleHtmlInfo {
    makerName: string;
}
/** Parse circle HTML. */
export declare function parseCircleHtml(content: string): CircleHtmlInfo;
/** Parse login form token. */
export declare function parseLoginToken(content: string): string;
//# sourceMappingURL=scraper.d.ts.map