import { resolveJsonPath, tryParseJson } from "./path-utils.js";
function tokenize(expr) {
    const ops = ["!=", ">=", "<=", "==", ">", "<"];
    const containsMatch = expr.match(/^(\S+)\s+contains\s+(.+)$/);
    if (containsMatch) {
        return { field: containsMatch[1], operator: "contains", expected: containsMatch[2].trim() };
    }
    for (const op of ops) {
        const idx = expr.indexOf(op);
        if (idx === -1)
            continue;
        const field = expr.slice(0, idx).trim();
        const expected = expr.slice(idx + op.length).trim();
        if (field && expected) {
            return { field, operator: op, expected };
        }
    }
    return null;
}
function parseExpectedValue(raw) {
    if (raw === "null" || raw === "undefined")
        return null;
    if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
        return raw.slice(1, -1);
    }
    const num = Number(raw);
    if (!isNaN(num) && raw.trim() !== "")
        return num;
    return raw;
}
function resolveField(field, ctx) {
    if (field === "status")
        return ctx.status;
    if (field === "duration")
        return ctx.duration;
    if (field.startsWith("body")) {
        const path = field.slice(4).replace(/^\./, "");
        if (!path)
            return ctx.body;
        return resolveJsonPath(ctx.body, path);
    }
    if (field.startsWith("headers")) {
        const headerKey = field.slice(7).replace(/^\./, "").toLowerCase().replace(/-/g, "");
        for (const [key, value] of Object.entries(ctx.headers)) {
            if (key.toLowerCase().replace(/-/g, "") === headerKey) {
                return value;
            }
        }
        return undefined;
    }
    return undefined;
}
function compareValues(actual, operator, expected) {
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
    if (isNaN(a) || isNaN(b))
        return false;
    switch (operator) {
        case ">": return a > b;
        case "<": return a < b;
        case ">=": return a >= b;
        case "<=": return a <= b;
        default: return false;
    }
}
export function evaluateAssertion(assertion, result, vars) {
    const body = tryParseJson(result.body);
    const ctx = {
        status: result.status,
        body,
        headers: result.responseHeaders || {},
        duration: result.durationMs,
    };
    const expr = assertion.expr || "";
    const name = assertion.name || expr;
    const resolvedExpr = resolveVars(expr, vars);
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
export function evaluateAssertions(assertions, result, vars) {
    return assertions.map((a) => {
        if (a.schema)
            return evaluateSchemaAssertion(a.schema, result.body);
        return evaluateAssertion(a, result, vars);
    });
}
function resolveVars(text, vars) {
    if (!vars)
        return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
        const trimmed = varName.trim();
        const value = vars.get(trimmed);
        if (value !== undefined)
            return value;
        const osValue = process.env[trimmed];
        if (osValue !== undefined)
            return osValue;
        return `{{${trimmed}}}`;
    });
}
export function assertsPassed(assertions) {
    return assertions.every((a) => a.passed);
}
export function evaluateSchemaAssertion(rawSchema, body) {
    const data = tryParseJson(body);
    if (typeof data === "string" || data === null) {
        return { name: "JSON Schema", passed: false, expected: JSON.stringify(rawSchema), actual: String(body), error: "Response is not valid JSON" };
    }
    const errors = validateSchema(rawSchema, data, "$");
    if (errors.length === 0) {
        return { name: "JSON Schema", passed: true, expected: "valid schema", actual: "valid" };
    }
    return { name: "JSON Schema", passed: false, expected: "valid schema", actual: errors.join("; "), error: errors.join(", ") };
}
// ReDoS-safe pattern test: limits to 200 chars and wraps in try/catch
function testPattern(pattern, value) {
    if (pattern.length > 200)
        return false;
    try {
        return new RegExp(pattern).test(value);
    }
    catch {
        return false;
    }
}
function validateSchema(raw, data, path) {
    const errors = [];
    const s = raw;
    if (s.nullable && (data === null || data === undefined))
        return errors;
    if (data === null || data === undefined) {
        errors.push(`${path}: expected non-null, got ${data}`);
        return errors;
    }
    if (s.type) {
        const types = Array.isArray(s.type) ? s.type : [s.type];
        const actualType = data === null ? "null" : Array.isArray(data) ? "array" : typeof data;
        if (!types.includes(actualType)) {
            errors.push(`${path}: expected type ${types.join("|")}, got ${actualType}`);
            return errors;
        }
    }
    if (s.enum && Array.isArray(s.enum) && !s.enum.includes(data)) {
        errors.push(`${path}: expected one of [${s.enum.join(", ")}], got ${data}`);
    }
    if (typeof data === "number") {
        if (typeof s.minimum === "number" && data < s.minimum) {
            errors.push(`${path}: expected >= ${s.minimum}, got ${data}`);
        }
        if (typeof s.maximum === "number" && data > s.maximum) {
            errors.push(`${path}: expected <= ${s.maximum}, got ${data}`);
        }
    }
    if (typeof data === "string") {
        if (typeof s.minLength === "number" && data.length < s.minLength) {
            errors.push(`${path}: expected minLength ${s.minLength}, got ${data.length}`);
        }
        if (typeof s.maxLength === "number" && data.length > s.maxLength) {
            errors.push(`${path}: expected maxLength ${s.maxLength}, got ${data.length}`);
        }
        if (typeof s.pattern === "string" && !testPattern(s.pattern, data)) {
            errors.push(`${path}: expected pattern ${s.pattern}, got "${data}"`);
        }
    }
    if (Array.isArray(s.required) && typeof data === "object" && !Array.isArray(data)) {
        for (const key of s.required) {
            if (typeof key === "string" && !(key in data)) {
                errors.push(`${path}: missing required field "${key}"`);
            }
        }
    }
    if (s.properties && typeof data === "object" && !Array.isArray(data)) {
        for (const [key, propSchema] of Object.entries(s.properties)) {
            if (key in data) {
                const val = data[key];
                errors.push(...validateSchema(propSchema, val, `${path}.${key}`));
            }
        }
    }
    if (s.items && Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
            errors.push(...validateSchema(s.items, data[i], `${path}[${i}]`));
        }
    }
    if (Array.isArray(s.oneOf)) {
        const passed = s.oneOf.filter((s) => validateSchema(s, data, path).length === 0);
        if (passed.length !== 1) {
            errors.push(`${path}: expected exactly one schema match, got ${passed.length}`);
        }
    }
    return errors;
}
//# sourceMappingURL=assertions.js.map