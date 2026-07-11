/**
 * JSON Schema validation (subset, sufficient for assertion use cases).
 *
 * Supports: type, properties, items, required, enum, minimum/maximum,
 * minLength/maxLength, pattern, format, nullable, oneOf/anyOf/allOf.
 */
export interface JSONSchema {
    type?: string | string[];
    properties?: Record<string, JSONSchema>;
    items?: JSONSchema;
    required?: string[];
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    nullable?: boolean;
    oneOf?: JSONSchema[];
    anyOf?: JSONSchema[];
    allOf?: JSONSchema[];
    $ref?: string;
}
interface ValidationResult {
    valid: boolean;
    errors: string[];
}
/**
 * Validate a JSON document against a (subset of) JSON Schema.
 * Returns a list of human-readable error messages.
 */
export declare function validateSchema(raw: JSONSchema | Record<string, unknown>, data: unknown, path?: string): string[];
/**
 * Convenience wrapper returning a ValidationResult.
 */
export declare function validateSchemaResult(schema: JSONSchema | Record<string, unknown>, data: unknown): ValidationResult;
export {};
//# sourceMappingURL=json-schema.d.ts.map