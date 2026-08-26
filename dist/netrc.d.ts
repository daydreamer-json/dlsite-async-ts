/** Minimal .netrc reader for login credential lookup. */
export interface NetrcAuthenticator {
    login: string;
    password: string;
}
/** Parse .netrc content into a mapping of machine name to credentials. */
export declare function parseNetrc(content: string): Map<string, NetrcAuthenticator>;
/**
 * Return credentials for `host` from ~/.netrc (or `~/_netrc`).
 *
 * Returns undefined when no file or no matching machine entry exists.
 */
export declare function netrcAuthenticators(host: string, path?: string): Promise<NetrcAuthenticator | undefined>;
//# sourceMappingURL=netrc.d.ts.map