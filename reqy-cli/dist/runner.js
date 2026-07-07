const VALID_METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
];
function getMethodsWithoutBody(method) {
    return method === "GET" || method === "HEAD";
}
function interpolateVariables(text, envVars) {
    return text.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
        const trimmed = varName.trim();
        const value = envVars.get(trimmed);
        if (value !== undefined) {
            return value;
        }
        // Fallback to process.env for OS env vars
        const osValue = process.env[trimmed];
        if (osValue !== undefined) {
            return osValue;
        }
        // Leave unmatched variables as-is so the user sees the unresolved placeholder
        return `{{${trimmed}}}`;
    });
}
function buildEnvVarMap(bundle, envName) {
    const map = new Map();
    if (envName && bundle.environments) {
        const env = bundle.environments.find((e) => e.name.toLowerCase() === envName.toLowerCase());
        if (env && env.variables) {
            for (const v of env.variables) {
                if (v.enabled) {
                    map.set(v.key, v.value);
                }
            }
        }
    }
    return map;
}
function buildUrl(request, envVars) {
    let url = interpolateVariables(request.url, envVars);
    // Append query params if not already present in URL
    if (request.queryParams && request.queryParams.length > 0) {
        const urlObj = new URL(url);
        for (const qp of request.queryParams) {
            const key = interpolateVariables(qp.key, envVars);
            const value = interpolateVariables(qp.value, envVars);
            urlObj.searchParams.append(key, value);
        }
        url = urlObj.toString();
    }
    return url;
}
function buildHeaders(request, envVars) {
    const headers = {};
    if (request.headers) {
        for (const [key, value] of Object.entries(request.headers)) {
            headers[key] = interpolateVariables(value, envVars);
        }
    }
    // Auth headers
    if (request.authType && request.authToken) {
        const token = interpolateVariables(request.authToken, envVars);
        switch (request.authType) {
            case "bearer":
                headers["Authorization"] = `Bearer ${token}`;
                break;
            case "basic":
                headers["Authorization"] = `Basic ${token}`;
                break;
            case "api-key":
                // API key placement varies; we don't auto-inject without knowing header name
                break;
            case "oauth2":
                headers["Authorization"] = `Bearer ${token}`;
                break;
        }
    }
    return headers;
}
export async function executeRequest(request, envVars, timeoutMs) {
    const method = request.method;
    const url = buildUrl(request, envVars);
    const headers = buildHeaders(request, envVars);
    let bodyToSend;
    if (!getMethodsWithoutBody(method) && request.body !== undefined && request.body !== null) {
        bodyToSend = interpolateVariables(request.body, envVars);
    }
    if (bodyToSend) {
        const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === "content-type");
        if (!hasContentType) {
            headers["Content-Type"] = "application/json";
        }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startTime = Date.now();
    try {
        const response = await fetch(url, {
            method,
            headers,
            body: bodyToSend,
            signal: controller.signal,
        });
        const durationMs = Date.now() - startTime;
        const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "";
        const isBinary = /^(image\/|video\/|audio\/|application\/pdf|application\/octet-stream)/.test(contentType);
        let body;
        let size = 0;
        if (isBinary) {
            const arrayBuffer = await response.arrayBuffer();
            size = arrayBuffer.byteLength;
            body = `<Binary response: ${size} bytes>`;
        }
        else {
            const text = await response.text();
            size = Buffer.byteLength(text, "utf8");
            body = text;
        }
        const passed = response.status < 400;
        return {
            name: request.name,
            method,
            url,
            status: response.status,
            statusText: response.statusText,
            durationMs,
            size,
            passed,
            body,
        };
    }
    catch (error) {
        const durationMs = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        const isTimeout = error instanceof DOMException && error.name === "AbortError";
        return {
            name: request.name,
            method,
            url,
            status: 0,
            statusText: isTimeout ? "Timeout" : "Error",
            durationMs,
            size: 0,
            passed: false,
            error: isTimeout ? `Request timed out after ${timeoutMs}ms` : message,
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
export function flattenRequests(bundle) {
    const requests = [];
    for (const collection of bundle.collections) {
        for (const request of collection.requests) {
            requests.push(request);
        }
    }
    return requests;
}
export async function runCollection(bundle, options) {
    const envVars = buildEnvVarMap(bundle, options.envName);
    let requests = flattenRequests(bundle);
    if (options.requestName) {
        const filter = options.requestName.toLowerCase();
        requests = requests.filter((r) => r.name.toLowerCase() === filter);
        if (requests.length === 0) {
            throw new Error(`No request found with name "${options.requestName}"`);
        }
    }
    const results = [];
    for (const request of requests) {
        if (!VALID_METHODS.includes(request.method)) {
            results.push({
                name: request.name,
                method: request.method,
                url: request.url,
                status: 0,
                statusText: "Invalid Method",
                durationMs: 0,
                size: 0,
                passed: false,
                error: `Invalid HTTP method: ${request.method}`,
            });
            continue;
        }
        const result = await executeRequest(request, envVars, options.timeoutMs);
        results.push(result);
    }
    return results;
}
//# sourceMappingURL=runner.js.map