/**
 * Shared utilities for JSONPath resolution and parsing.
 * Extracted from assertions.ts and chaining.ts to eliminate duplication.
 */
export function tokenizePath(path) {
    const parts = [];
    let current = "";
    let inBracket = false;
    for (let i = 0; i < path.length; i++) {
        const c = path[i];
        if (c === "[") {
            if (current) {
                parts.push(current);
                current = "";
            }
            inBracket = true;
        }
        else if (c === "]") {
            if (current) {
                parts.push(current);
                current = "";
            }
            inBracket = false;
        }
        else if (c === "." && !inBracket) {
            if (current) {
                parts.push(current);
                current = "";
            }
        }
        else {
            current += c;
        }
    }
    if (current)
        parts.push(current);
    return parts;
}
export function resolveJsonPath(obj, path) {
    if (!path)
        return undefined;
    const parts = tokenizePath(path);
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined)
            return undefined;
        if (Array.isArray(current)) {
            if (part === "length") {
                current = current.length;
                continue;
            }
            const idx = parseInt(part, 10);
            if (!isNaN(idx)) {
                current = current[idx];
                continue;
            }
            return undefined;
        }
        if (typeof current === "object") {
            current = current[part];
        }
        else {
            return undefined;
        }
    }
    return current;
}
export function tryParseJson(body) {
    if (!body)
        return null;
    try {
        return JSON.parse(body);
    }
    catch {
        return body;
    }
}
//# sourceMappingURL=path-utils.js.map