/**
 * Module OpenAPI unifié — import/export au format OpenAPI 3.0
 * Basé sur recli (référence la plus avancée) + export depuis reqy-mcp
 */
import yaml from "js-yaml";
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
// ── Import ──────────────────────────────────────────────────
/**
 * Importe une spec OpenAPI (JSON ou YAML) et retourne un ExportBundle.
 * Supporte OpenAPI 3.x
 */
export function importOpenAPI(specYamlOrJson) {
    let doc;
    try {
        doc = JSON.parse(specYamlOrJson);
    }
    catch {
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
                id: `req-${requests.length + 1}`,
                name,
                method: httpMethod,
                url,
                endpoint: path,
                headers: Object.keys(headers).length > 0 ? headers : undefined,
                body,
                bodyType: body ? "json" : undefined,
                authType: undefined,
                authToken: undefined,
                queryParams: queryParams.length > 0 ? queryParams : undefined,
                sortOrder: requests.length,
            });
        }
    }
    const collection = {
        id: `col-1`,
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
// ── Export ──────────────────────────────────────────────────
/**
 * Exporte des collections au format OpenAPI 3.0 (JSON)
 */
export function exportToOpenApi(collections) {
    const paths = {};
    for (const collection of collections) {
        for (const request of collection.requests) {
            const rawPath = request.endpoint?.trim() || request.url?.trim() || "/";
            let path = rawPath;
            try {
                const url = new URL(rawPath);
                path = url.pathname;
            }
            catch {
                if (!path.startsWith("/"))
                    path = `/${path}`;
            }
            const method = request.method.toLowerCase();
            if (!paths[path])
                paths[path] = {};
            const parameters = [
                ...(request.queryParams ?? [])
                    .filter((p) => p.key.trim())
                    .map((p) => ({
                    name: p.key.trim(),
                    in: "query",
                    required: false,
                    schema: { type: "string" },
                    example: p.value.trim() || undefined,
                })),
                ...Object.entries(request.headers ?? {})
                    .filter(([key]) => key.trim())
                    .map(([key, value]) => ({
                    name: key.trim(),
                    in: "header",
                    required: false,
                    schema: { type: "string" },
                    example: value || undefined,
                })),
            ];
            const requestBody = request.body
                ? {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { type: "object" },
                            example: (() => {
                                try {
                                    return JSON.parse(request.body);
                                }
                                catch {
                                    return request.body;
                                }
                            })(),
                        },
                    },
                }
                : undefined;
            paths[path][method] = {
                operationId: `${collection.name}_${request.name}_${request.method}`.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, ""),
                tags: [collection.name],
                summary: request.name || `${request.method} ${path}`,
                parameters,
                ...(requestBody ? { requestBody } : {}),
                responses: {
                    "200": {
                        description: "Successful response",
                        content: {
                            "application/json": {
                                schema: { type: "object" },
                            },
                        },
                    },
                },
            };
        }
    }
    const spec = {
        openapi: "3.0.0",
        info: { title: "Exported from Reqly", version: "1.0.0" },
        paths,
    };
    return JSON.stringify(spec, null, 2);
}
//# sourceMappingURL=index.js.map