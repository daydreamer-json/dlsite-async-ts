/** Minimal .netrc reader for login credential lookup. */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
/** Parse .netrc content into a mapping of machine name to credentials. */
export function parseNetrc(content) {
    const stripped = content.replace(/#[^\n]*/g, "");
    const tokens = stripped.match(/\S+/g) ?? [];
    const machines = new Map();
    let current;
    let authenticator;
    const flush = () => {
        if (current !== undefined && authenticator !== undefined) {
            machines.set(current, authenticator);
        }
    };
    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token === undefined) {
            continue;
        }
        switch (token) {
            case "machine":
            case "default": {
                flush();
                authenticator = { login: "", password: "" };
                current = token === "default" ? "default" : tokens[i + 1];
                if (token !== "default") {
                    i += 1;
                }
                break;
            }
            case "login": {
                if (authenticator !== undefined) {
                    authenticator.login = tokens[i + 1] ?? "";
                }
                i += 1;
                break;
            }
            case "account": {
                i += 1;
                break;
            }
            case "password": {
                if (authenticator !== undefined) {
                    authenticator.password = tokens[i + 1] ?? "";
                }
                i += 1;
                break;
            }
            default: {
                break;
            }
        }
    }
    flush();
    return machines;
}
/**
 * Return credentials for `host` from ~/.netrc (or `~/_netrc`).
 *
 * Returns undefined when no file or no matching machine entry exists.
 */
export async function netrcAuthenticators(host, path) {
    const candidates = path !== undefined ? [path] : [
        join(homedir(), ".netrc"),
        join(homedir(), "_netrc"),
    ];
    for (const candidate of candidates) {
        let content;
        try {
            content = await readFile(candidate, "utf8");
        }
        catch {
            continue;
        }
        const authenticator = parseNetrc(content).get(host);
        if (authenticator !== undefined &&
            authenticator.login !== "" &&
            authenticator.password !== "") {
            return authenticator;
        }
    }
    return undefined;
}
//# sourceMappingURL=netrc.js.map