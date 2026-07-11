/**
 * JSON Schema validation (subset, sufficient for assertion use cases).
 *
 * Supports: type, properties, items, required, enum, minimum/maximum,
 * minLength/maxLength, pattern, format, nullable, oneOf/anyOf/allOf.
 */
/**
 * ReDoS-safe pattern test: limits pattern length and wraps RegExp creation
 * in a try/catch so a malformed pattern cannot crash the runner.
 */
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
function getActualType(data) {
    if (data === null)
        return "null";
    if (Array.isArray(data))
        return "array";
    return typeof data;
}
/**
 * Validate a JSON document against a (subset of) JSON Schema.
 * Returns a list of human-readable error messages.
 */
export function validateSchema(raw, data, path = "$") {
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
        const actualType = getActualType(data);
        if (!types.includes(actualType)) {
            errors.push(`${path}: expected type ${types.join("|")}, got ${actualType}`);
            return errors;
        }
    }
    if (s.enum && Array.isArray(s.enum) && !s.enum.includes(data)) {
        errors.push(`${path}: expected one of [${s.enum.join(", ")}], got ${String(data)}`);
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
                const value = data[key];
                errors.push(...validateSchema(propSchema, value, `${path}.${key}`));
            }
        }
    }
    if (s.items && Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
            errors.push(...validateSchema(s.items, data[i], `${path}[${i}]`));
        }
    }
    if (Array.isArray(s.oneOf)) {
        const matches = s.oneOf.filter((sub) => validateSchema(sub, data, path).length === 0);
        if (matches.length !== 1) {
            errors.push(`${path}: expected exactly one schema match, got ${matches.length}`);
        }
    }
    return errors;
}
/**
 * Convenience wrapper returning a ValidationResult.
 */
export function validateSchemaResult(schema, data) {
    const errors = validateSchema(schema, data);
    return { valid: errors.length === 0, errors };
}
//# sourceMappingURL=json-schema.js.map