/**
 * Shared utilities for JSONPath resolution and parsing.
 * Extracted from assertions.ts and chaining.ts to eliminate duplication.
 */
export declare function tokenizePath(path: string): string[];
export declare function resolveJsonPath(obj: unknown, path: string): unknown;
export declare function tryParseJson(body: string | undefined): unknown;
//# sourceMappingURL=path-utils.d.ts.map