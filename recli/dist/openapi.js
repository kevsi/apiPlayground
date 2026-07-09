import yaml from "js-yaml";
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
export function importOpenAPI(specYamlOrJson) {
    let doc;
    try {
        doc = JSON.parse(specYamlOrJson);
    }
    catch {
        // Use js-yaml for robust YAML parsing (supports arrays, anchors, multi-line, etc.)
        try {
            doc = yaml.load(specYamlOrJson);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`Failed to parse OpenAPI spec: ${msg}`);
        }
    }
    if (!doc.openapi || !doc.paths) {
        throw new Error("Invalid OpenAPI spec: missing 'openapi' version or 'paths'");
    }
    const baseUrl = doc.servers?.[0]?.url || "http://localhost";
    const collectionName = doc.info?.title || "OpenAPI Import";
    const requests = [];
    for (const [path, methods] of Object.entries(doc.paths)) {
        for (const method of HTTP_METHODS) {
            const op = methods[method];
            if (!op)
                continue;
            const name = op.operationId || op.summary || `${method.toUpperCase()} ${path}`;
            let url = `${baseUrl}${path}`;
            const queryParams = [];
            const headers = {};
            let body;
            if (op.parameters) {
                for (const param of op.parameters) {
                    if (param.in === "query") {
                        queryParams.push({
                            key: param.name,
                            value: param.example !== undefined ? String(param.example) : param.schema?.default !== undefined ? String(param.schema.default) : "",
                        });
                    }
                    else if (param.in === "header") {
                        headers[param.name] = param.example !== undefined ? String(param.example) : "";
                    }
                    else if (param.in === "path") {
                        url = url.replace(`{${param.name}}`, param.example !== undefined ? String(param.example) : `:${param.name}`);
                    }
                }
            }
            if (op.requestBody) {
                const jsonContent = op.requestBody.content?.["application/json"];
                if (jsonContent?.example) {
                    body = JSON.stringify(jsonContent.example, null, 2);
                }
                else if (jsonContent?.schema) {
                    body = JSON.stringify(generateExampleFromSchema(jsonContent.schema), null, 2);
                }
            }
            const httpMethod = method.toUpperCase();
            if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "CONNECT"].includes(httpMethod))
                continue;
            requests.push({
                name,
                method: httpMethod,
                url,
                endpoint: path,
                headers: Object.keys(headers).length > 0 ? headers : undefined,
                body,
                bodyType: body ? "json" : undefined,
                queryParams: queryParams.length > 0 ? queryParams : undefined,
                description: op.summary || op.description,
            });
        }
    }
    const collection = {
        name: collectionName,
        description: `Imported from OpenAPI spec: ${doc.info?.version || "unknown version"}`,
        requests,
    };
    return {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        collections: [collection],
    };
}
function generateExampleFromSchema(schema) {
    if (schema.example !== undefined)
        return schema.example;
    if (schema.type === "object" && schema.properties) {
        const result = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
            result[key] = generateExampleFromSchema(prop);
        }
        return result;
    }
    if (schema.type === "array") {
        const items = schema.items ? generateExampleFromSchema(schema.items) : "";
        return [items];
    }
    if (schema.type === "string") {
        if (schema.enum && Array.isArray(schema.enum))
            return schema.enum[0];
        if (schema.format === "date-time")
            return new Date().toISOString();
        if (schema.format === "email")
            return "user@example.com";
        if (schema.format === "uri")
            return "https://example.com";
        if (schema.format === "uuid")
            return "550e8400-e29b-41d4-a716-446655440000";
        return "string";
    }
    if (schema.type === "integer" || schema.type === "number")
        return 0;
    if (schema.type === "boolean")
        return false;
    return null;
}
//# sourceMappingURL=openapi.js.map