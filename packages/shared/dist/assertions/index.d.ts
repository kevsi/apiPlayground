/**
 * Unified assertion engine.
 *
 * Supports two input formats:
 * - Text format (recli): `assertion.expr` like `status == 200`
 * - Structured format (reqy-mcp): `assertion.type` + `target` + `operator` + `value`
 *
 * Also supports JSON Schema validation via `assertion.schema`.
 *
 * The unified API exposes both evaluation styles so existing callers can
 * migrate incrementally without breaking their call sites.
 */
import type { Assertion, AssertionResult } from "../types.js";
export { tokenize, parseExpectedValue, resolveVars, type ParsedToken, } from "./text-parser.js";
export { validateSchema, validateSchemaResult, type JSONSchema } from "./json-schema.js";
export { resolveJsonPath, tryParseJson, tokenizePath, getValueByPath } from "../variable-path/index.js";
/**
 * Unified context for assertion evaluation. Callers (recli/reqy-mcp/reqy-web)
 * can adapt their own structures to this shape.
 */
export interface UnifiedEvalContext {
    status: number;
    body?: string;
    headers?: Record<string, string>;
    durationMs: number;
}
/**
 * Convert a recli/reqy-mcp RunResult into the unified context.
 */
export declare function runResultToContext(result: {
    status: number;
    durationMs: number;
    body?: string;
    responseHeaders?: Record<string, string>;
    headers?: Record<string, string>;
}): UnifiedEvalContext;
/**
 * Resolve a field reference against the context. Supports:
 * - `status`, `duration`
 * - `body`, `body.<path>`, `body.<path>[<index>]`
 * - `headers.<name>`
 */
export declare function resolveField(field: string, ctx: UnifiedEvalContext): unknown;
/**
 * Compare two values with a given operator. Numeric operators coerce both
 * sides via Number(); the equality operators use String() comparison so that
 * `status == "200"` matches `status == 200`.
 */
export declare function compareValues(actual: unknown, operator: string, expected: string | number | null): boolean;
export interface TextEvaluateOptions {
    /** Optional vars map used to interpolate {{var}} in expressions */
    vars?: Map<string, string>;
}
/**
 * Evaluate a single text-format assertion (recli style).
 *
 * @param assertion should have `expr` set, optionally `name` and `schema`.
 * @param ctx the unified evaluation context.
 * @param options optional variable map for `{{var}}` interpolation.
 */
export declare function evaluateTextAssertion(assertion: Assertion, ctx: UnifiedEvalContext, options?: TextEvaluateOptions): AssertionResult;
/**
 * Evaluate a list of text-format assertions.
 */
export declare function evaluateTextAssertions(assertions: Assertion[], ctx: UnifiedEvalContext, options?: TextEvaluateOptions): AssertionResult[];
/**
 * Evaluate a JSON Schema assertion against a body string.
 */
export declare function evaluateSchemaAssertion(rawSchema: Record<string, unknown>, body: string | undefined): AssertionResult;
export type StructuredAssertionType = "status-code" | "response-time" | "json-path" | "header" | "body-contains";
export type StructuredAssertionOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "regex" | "exists" | "notExists";
/**
 * Evaluate a structured assertion (reqy-mcp style).
 */
export declare function evaluateStructuredAssertion(assertion: Assertion, ctx: UnifiedEvalContext): AssertionResult;
/**
 * Evaluate a list of structured assertions. Disabled assertions (`enabled === false`)
 * are filtered out, matching reqy-mcp behaviour.
 */
export declare function evaluateStructuredAssertions(assertions: Assertion[], ctx: UnifiedEvalContext): AssertionResult[];
/**
 * Auto-detect the format of an assertion and dispatch to the appropriate
 * evaluator. Text format takes precedence when `expr` is present.
 */
export declare function evaluateAssertion(assertion: Assertion, ctx: UnifiedEvalContext, options?: TextEvaluateOptions): AssertionResult;
/**
 * Evaluate a list of assertions of any supported format.
 */
export declare function evaluateAssertions(assertions: Assertion[], ctx: UnifiedEvalContext, options?: TextEvaluateOptions): AssertionResult[];
/**
 * Returns true iff every assertion in the list passed.
 */
export declare function assertsPassed(assertions: AssertionResult[]): boolean;
/**
 * @deprecated Use evaluateTextAssertion. Alias kept for recli migration.
 */
export declare const evaluateAssertionLegacy: typeof evaluateTextAssertion;
/**
 * @deprecated Use evaluateTextAssertions. Alias kept for recli migration.
 */
export declare const evaluateAssertionsLegacy: typeof evaluateTextAssertions;
//# sourceMappingURL=index.d.ts.map