/**
 * Unified JSONPath utilities.
 *
 * Provides both API styles previously found across packages:
 * - `resolveJsonPath` / `tokenizePath` / `tryParseJson` (recli style)
 * - `getValueByPath` / `PathExtractionResult` / `parseResponseForExtraction`
 *   (reqy-mcp / reqy-web style)
 *
 * Web-specific extractors (XML, regex, content-type detection) stay in
 * reqy-web since they depend on browser APIs (DOMParser, Blob).
 */
/**
 * Split a dotted/bracketed path into segments.
 *
 *   "a.b[0].c" -> ["a", "b", "0", "c"]
 *   "items[2].name" -> ["items", "2", "name"]
 */
export declare function tokenizePath(path: string): string[];
/**
 * Resolve a path string against an object. Returns `undefined` when the
 * path cannot be resolved (intermediate value is null/undefined, or the
 * key does not exist).
 *
 *   resolveJsonPath({a: {b: [{c: 1}]}}, "a.b[0].c") === 1
 */
export declare function resolveJsonPath(obj: unknown, path: string): unknown;
/**
 * Try to parse a string as JSON. Returns the original string when parsing fails.
 */
export declare function tryParseJson(body: string | undefined | null): unknown;
export interface PathExtractionResult {
    success: boolean;
    value?: unknown;
    error?: string;
}
/**
 * Read a value at a dotted path. Supports `$.foo`, `foo.bar`, `items[0]`.
 * Returns a structured result so callers can distinguish a real `undefined`
 * value from a missing path.
 */
export declare function getValueByPath(value: unknown, path: string): PathExtractionResult;
/**
 * Parse a response body for value extraction. Returns the parsed value
 * alongside a flag indicating whether the original looked like JSON.
 */
export declare function parseResponseForExtraction(responseBody: string): {
    parsed: unknown;
    isJson: boolean;
};
//# sourceMappingURL=index.d.ts.map