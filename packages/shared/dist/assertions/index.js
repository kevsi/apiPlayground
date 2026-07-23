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
import { tokenize, parseExpectedValue, resolveVars } from "./text-parser.js";
import { validateSchema } from "./json-schema.js";
import { getValueByPath, parseResponseForExtraction } from "../variable-path/index.js";
import { resolveJsonPath, tryParseJson } from "../variable-path/index.js";
// ── Public re-exports ──────────────────────────────────────
export { tokenize, parseExpectedValue, resolveVars } from "./text-parser.js";
export { validateSchema, validateSchemaResult } from "./json-schema.js";
export { resolveJsonPath, tryParseJson, tokenizePath, getValueByPath, } from "../variable-path/index.js";
/**
 * Convert a recli/reqy-mcp RunResult into the unified context.
 */
export function runResultToContext(result) {
    return {
        status: result.status,
        body: result.body,
        headers: result.responseHeaders ?? result.headers ?? {},
        durationMs: result.durationMs,
    };
}
// ── Field resolution (text format) ────────────────────────
/**
 * Resolve a field reference against the context. Supports:
 * - `status`, `duration`
 * - `body`, `body.<path>`, `body.<path>[<index>]`
 * - `headers.<name>`
 */
export function resolveField(field, ctx) {
    if (field === "status")
        return ctx.status;
    if (field === "duration")
        return ctx.durationMs;
    if (field.startsWith("body")) {
        const rest = field.slice(4).replace(/^\./, "");
        const body = tryParseJson(ctx.body);
        if (!rest)
            return body;
        return resolveJsonPath(body, rest);
    }
    if (field.startsWith("headers")) {
        const headerKey = field.slice(7).replace(/^\./, "").toLowerCase().replace(/-/g, "");
        if (!ctx.headers)
            return undefined;
        for (const [key, value] of Object.entries(ctx.headers)) {
            if (key.toLowerCase().replace(/-/g, "") === headerKey) {
                return value;
            }
        }
        return undefined;
    }
    return undefined;
}
// ── Comparison helpers ─────────────────────────────────────
/**
 * Compare two values with a given operator. Numeric operators coerce both
 * sides via Number(); the equality operators use String() comparison so that
 * `status == "200"` matches `status == 200`.
 */
export function compareValues(actual, operator, expected) {
    if (operator === "contains") {
        if (typeof actual === "string" && typeof expected === "string") {
            return actual.toLowerCase().includes(expected.toLowerCase());
        }
        if (Array.isArray(actual)) {
            return actual.some((item) => {
                if (typeof item === "object" && item !== null) {
                    return Object.values(item).some((v) => String(v) === String(expected));
                }
                return String(item) === String(expected);
            });
        }
        if (typeof actual === "object" && actual !== null) {
            return Object.values(actual).some((v) => String(v) === String(expected));
        }
        return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    }
    if (operator === "==") {
        if (expected === null)
            return actual === null || actual === undefined;
        return String(actual) === String(expected);
    }
    if (operator === "!=") {
        if (expected === null)
            return actual !== null && actual !== undefined;
        return String(actual) !== String(expected);
    }
    const a = Number(actual);
    const b = Number(expected);
    if (Number.isNaN(a) || Number.isNaN(b))
        return false;
    switch (operator) {
        case ">":
            return a > b;
        case "<":
            return a < b;
        case ">=":
            return a >= b;
        case "<=":
            return a <= b;
        default:
            return false;
    }
}
/**
 * Evaluate a single text-format assertion (recli style).
 *
 * @param assertion should have `expr` set, optionally `name` and `schema`.
 * @param ctx the unified evaluation context.
 * @param options optional variable map for `{{var}}` interpolation.
 */
export function evaluateTextAssertion(assertion, ctx, options = {}) {
    const expr = assertion.expr || "";
    const name = assertion.name || expr;
    const resolvedExpr = resolveVars(expr, options.vars);
    const tokens = tokenize(resolvedExpr);
    if (!tokens) {
        return {
            name,
            passed: false,
            rawExpr: expr,
            expected: "",
            actual: "",
            error: `Invalid assertion expression: "${expr}". Use format: field operator value (e.g. status == 200)`,
        };
    }
    const actual = resolveField(tokens.field, ctx);
    const expected = parseExpectedValue(tokens.expected);
    const passed = compareValues(actual, tokens.operator, expected);
    return {
        name,
        passed,
        rawExpr: expr,
        expected: typeof expected === "string" ? expected : String(expected),
        actual: actual !== undefined ? String(actual) : "undefined",
    };
}
/**
 * Evaluate a list of text-format assertions.
 */
export function evaluateTextAssertions(assertions, ctx, options = {}) {
    return assertions.map((a) => {
        if (a.schema)
            return evaluateSchemaAssertion(a.schema, ctx.body);
        return evaluateTextAssertion(a, ctx, options);
    });
}
// ── JSON Schema evaluation ─────────────────────────────────
/**
 * Evaluate a JSON Schema assertion against a body string.
 */
export function evaluateSchemaAssertion(rawSchema, body) {
    const data = tryParseJson(body);
    if (typeof data === "string" || data === null) {
        return {
            name: "JSON Schema",
            passed: false,
            expected: JSON.stringify(rawSchema),
            actual: String(body),
            error: "Response is not valid JSON",
        };
    }
    const errors = validateSchema(rawSchema, data, "$");
    if (errors.length === 0) {
        return {
            name: "JSON Schema",
            passed: true,
            expected: "valid schema",
            actual: "valid",
        };
    }
    return {
        name: "JSON Schema",
        passed: false,
        expected: "valid schema",
        actual: errors.join("; "),
        error: errors.join(", "),
    };
}
/**
 * Internal comparator for numeric assertions.
 */
function compareNumeric(actual, expected, operator) {
    switch (operator) {
        case "eq":
            return actual === expected;
        case "neq":
            return actual !== expected;
        case "gt":
            return actual > expected;
        case "gte":
            return actual >= expected;
        case "lt":
            return actual < expected;
        case "lte":
            return actual <= expected;
        default:
            return false;
    }
}
/**
 * Try to parse `value` as JSON; fall back to the raw string.
 */
function parseStructuredExpected(value) {
    if (value === undefined)
        return undefined;
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
}
function deepEqual(a, b) {
    if (a === b)
        return true;
    if (typeof a !== typeof b)
        return false;
    if (a === null || b === null)
        return false;
    if (typeof a === "object")
        return JSON.stringify(a) === JSON.stringify(b);
    return false;
}
/**
 * Evaluate a structured assertion (reqy-mcp style).
 */
export function evaluateStructuredAssertion(assertion, ctx) {
    const type = assertion.type;
    try {
        switch (type) {
            case "status-code": {
                const raw = assertion.value ?? assertion.target;
                let passed = false;
                let expected = raw;
                // Support { in: [...] } and { not: number } syntax
                if (typeof raw === "object" && raw !== null) {
                    const obj = raw;
                    if ("in" in obj && Array.isArray(obj.in)) {
                        passed = obj.in.includes(ctx.status);
                        expected = obj.in;
                    }
                    else if ("not" in obj) {
                        passed = ctx.status !== Number(obj.not);
                        expected = obj.not;
                    }
                }
                else {
                    const expectedNum = Number(raw);
                    if (Number.isNaN(expectedNum)) {
                        return {
                            assertion,
                            passed: false,
                            actualValue: ctx.status,
                            error: `Invalid expected status: ${raw}`,
                        };
                    }
                    const op = (assertion.operator ?? "eq");
                    passed = compareNumeric(ctx.status, expectedNum, op);
                }
                return { assertion, passed, actualValue: ctx.status };
            }
            case "response-time": {
                const expected = Number(assertion.value ?? assertion.target);
                if (Number.isNaN(expected)) {
                    return {
                        assertion,
                        passed: false,
                        actualValue: ctx.durationMs,
                        error: `Invalid expected response time: ${assertion.value ?? assertion.target}`,
                    };
                }
                const op = (assertion.operator ?? "lt");
                const passed = compareNumeric(ctx.durationMs, expected, op);
                return { assertion, passed, actualValue: ctx.durationMs };
            }
            case "json-path": {
                if (!ctx.body) {
                    return {
                        assertion,
                        passed: false,
                        actualValue: null,
                        error: "No response body",
                    };
                }
                const { parsed, isJson } = parseResponseForExtraction(ctx.body);
                if (!isJson) {
                    return {
                        assertion,
                        passed: false,
                        actualValue: null,
                        error: "Response body is not JSON",
                    };
                }
                const extraction = getValueByPath(parsed, assertion.target ?? "");
                const op = (assertion.operator ?? "exists");
                if (!extraction.success) {
                    return {
                        assertion,
                        passed: op === "notExists",
                        actualValue: null,
                        error: extraction.error,
                    };
                }
                const actual = extraction.value;
                let passed = false;
                switch (op) {
                    case "eq":
                        passed = deepEqual(actual, parseStructuredExpected(assertion.value));
                        break;
                    case "neq":
                        passed = !deepEqual(actual, parseStructuredExpected(assertion.value));
                        break;
                    case "contains":
                        passed =
                            typeof actual === "string" &&
                                typeof assertion.value === "string" &&
                                actual.toLowerCase().includes(assertion.value.toLowerCase());
                        break;
                    case "exists":
                        passed = actual !== undefined && actual !== null;
                        break;
                    case "notExists":
                        passed = actual === undefined || actual === null;
                        break;
                    case "gt":
                    case "gte":
                    case "lt":
                    case "lte":
                        passed = compareNumeric(Number(actual), Number(assertion.value), op);
                        break;
                    case "regex":
                        passed =
                            typeof actual === "string" &&
                                typeof assertion.value === "string" &&
                                new RegExp(assertion.value).test(actual);
                        break;
                    default:
                        return {
                            assertion,
                            passed: false,
                            actualValue: actual,
                            error: `Unsupported operator: ${op}`,
                        };
                }
                return { assertion, passed, actualValue: actual };
            }
            case "header": {
                const headerName = assertion.target ?? "";
                const actual = Object.entries(ctx.headers ?? {}).find(([k]) => k.toLowerCase() === headerName.toLowerCase())?.[1];
                const op = (assertion.operator ?? "exists");
                if (actual === undefined) {
                    return {
                        assertion,
                        passed: op === "notExists",
                        actualValue: null,
                        error: `Header not found: ${headerName}`,
                    };
                }
                let passed = false;
                switch (op) {
                    case "exists":
                        passed = true;
                        break;
                    case "notExists":
                        passed = false;
                        break;
                    case "eq":
                        passed = actual === assertion.value;
                        break;
                    case "neq":
                        passed = actual !== assertion.value;
                        break;
                    case "contains":
                        passed =
                            typeof assertion.value === "string" &&
                                actual.toLowerCase().includes(assertion.value.toLowerCase());
                        break;
                    case "regex":
                        passed =
                            typeof assertion.value === "string" && new RegExp(assertion.value).test(actual);
                        break;
                    default:
                        return {
                            assertion,
                            passed: false,
                            actualValue: actual,
                            error: `Unsupported operator: ${op}`,
                        };
                }
                return { assertion, passed, actualValue: actual };
            }
            case "body-contains": {
                if (!ctx.body) {
                    return {
                        assertion,
                        passed: false,
                        actualValue: null,
                        error: "No response body",
                    };
                }
                const search = assertion.target ?? "";
                const passed = ctx.body.toLowerCase().includes(search.toLowerCase());
                return { assertion, passed, actualValue: ctx.body.slice(0, 200) };
            }
            default:
                return {
                    assertion,
                    passed: false,
                    actualValue: null,
                    error: `Unknown assertion type: ${assertion.type ?? "undefined"}`,
                };
        }
    }
    catch (err) {
        return {
            assertion,
            passed: false,
            actualValue: null,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
/**
 * Evaluate a list of structured assertions. Disabled assertions (`enabled === false`)
 * are filtered out, matching reqy-mcp behaviour.
 */
export function evaluateStructuredAssertions(assertions, ctx) {
    return assertions
        .filter((a) => a.enabled !== false)
        .map((assertion) => evaluateStructuredAssertion(assertion, ctx));
}
// ── Unified dispatch ───────────────────────────────────────
/**
 * Auto-detect the format of an assertion and dispatch to the appropriate
 * evaluator. Text format takes precedence when `expr` is present.
 */
export function evaluateAssertion(assertion, ctx, options = {}) {
    if (assertion.expr) {
        if (assertion.schema) {
            return evaluateSchemaAssertion(assertion.schema, ctx.body);
        }
        return evaluateTextAssertion(assertion, ctx, options);
    }
    if (assertion.type) {
        return evaluateStructuredAssertion(assertion, ctx);
    }
    if (assertion.schema) {
        return evaluateSchemaAssertion(assertion.schema, ctx.body);
    }
    return {
        name: assertion.name,
        passed: false,
        error: "Assertion has no expression, type, or schema",
    };
}
/**
 * Evaluate a list of assertions of any supported format.
 */
export function evaluateAssertions(assertions, ctx, options = {}) {
    return assertions.map((a) => evaluateAssertion(a, ctx, options));
}
/**
 * Returns true iff every assertion in the list passed.
 */
export function assertsPassed(assertions) {
    return assertions.every((a) => a.passed);
}
// ── Legacy aliases for backward compatibility ──────────────
/**
 * @deprecated Use evaluateTextAssertion. Alias kept for recli migration.
 */
export const evaluateAssertionLegacy = evaluateTextAssertion;
/**
 * @deprecated Use evaluateTextAssertions. Alias kept for recli migration.
 */
export const evaluateAssertionsLegacy = evaluateTextAssertions;
//# sourceMappingURL=index.js.map