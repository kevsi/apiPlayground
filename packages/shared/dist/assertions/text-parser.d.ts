/**
 * Text-based assertion parser (recli format).
 *
 * Supports expressions like:
 *   status == 200
 *   status != 404
 *   body.user.id == 1
 *   body.items.length > 0
 *   headers.content-type contains 'json'
 *   duration < 1000
 */
export interface ParsedToken {
    field: string;
    operator: string;
    expected: string;
}
/**
 * Tokenize an expression like `field op value` into its parts.
 * Returns null when the expression cannot be parsed.
 */
export declare function tokenize(expr: string): ParsedToken | null;
/**
 * Parse an expected value literal: `'string'`, `"string"`, `null`, or numeric.
 */
export declare function parseExpectedValue(raw: string): string | number | null;
/**
 * Resolve `{{var}}` interpolations in a string using a vars map, then
 * falling back to `process.env` values when available.
 */
export declare function resolveVars(text: string, vars?: Map<string, string>): string;
//# sourceMappingURL=text-parser.d.ts.map