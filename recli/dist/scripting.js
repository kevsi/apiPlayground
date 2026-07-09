import vm from "node:vm";
export class ScriptError extends Error {
    scriptType;
    scriptSource;
    constructor(message, scriptType, scriptSource) {
        super(`[${scriptType} script] ${message}`);
        this.scriptType = scriptType;
        this.scriptSource = scriptSource;
        this.name = "ScriptError";
    }
}
export class AssertionError extends Error {
    constructor(message) {
        super(message);
        this.name = "AssertionError";
    }
}
export function createScriptContext(ctx, request, result) {
    const env = {
        get: (key) => ctx.envVars.get(key),
        set: (key, value) => { ctx.envVars.set(key, value); ctx.vars.set(key, value); },
        unset: (key) => { ctx.envVars.delete(key); ctx.vars.delete(key); },
    };
    const vars = {
        get: (key) => ctx.vars.get(key),
        set: (key, value) => ctx.vars.set(key, value),
        unset: (key) => ctx.vars.delete(key),
    };
    const reqHeaders = { ...(request.headers || {}) };
    const requestAPI = {
        get method() { return request.method; },
        set method(v) { request.method = v; },
        get url() { return request.url; },
        set url(v) { request.url = v; },
        get headers() { return reqHeaders; },
        set headers(v) { Object.assign(reqHeaders, v); },
        get body() { return request.body; },
        set body(v) { request.body = v; },
        setHeader(key, value) { reqHeaders[key] = value; },
        setMethod(m) { request.method = m; },
        setUrl(u) { request.url = u; },
        setBody(b) { request.body = b; },
    };
    let responseAPI;
    if (result) {
        responseAPI = {
            status: result.status,
            statusText: result.statusText,
            headers: result.responseHeaders || {},
            get body() { return result.body; },
            json() {
                try {
                    return JSON.parse(result.body || "null");
                }
                catch {
                    throw new Error("Response body is not valid JSON");
                }
            },
            text() { return result.body || ""; },
            headersAsObject() { return { ...(result.responseHeaders || {}) }; },
        };
    }
    return { env, vars, request: requestAPI, response: responseAPI };
}
export function executeScript(scriptSource, scriptContext, scriptType) {
    if (!scriptSource || !scriptSource.trim())
        return;
    // SECURITY: Create context with null prototype to prevent constructor-chain escapes.
    // Only safe primitives and whitelisted APIs are passed. All objects that have
    // a .constructor property (which can lead to the Function constructor) are
    // wrapped or replaced with safe alternatives.
    const sandbox = vm.createContext(Object.create(null));
    sandbox.env = scriptContext.env;
    sandbox.vars = scriptContext.vars;
    sandbox.request = scriptContext.request;
    sandbox.console = createSandboxConsole();
    sandbox.expect = createExpectFunction();
    // Wrap JSON to strip constructor access while keeping parse/stringify
    sandbox.JSON = {
        parse: (text) => JSON.parse(text),
        stringify: (value, space) => JSON.stringify(value, null, space),
    };
    // Wrap Math to strip constructor access (Math.constructor === Object)
    sandbox.Math = {
        abs: Math.abs,
        ceil: Math.ceil,
        floor: Math.floor,
        round: Math.round,
        max: Math.max,
        min: Math.min,
        pow: Math.pow,
        sqrt: Math.sqrt,
        random: Math.random,
        sin: Math.sin, cos: Math.cos, tan: Math.tan,
        PI: Math.PI,
        E: Math.E,
    };
    // Date is a constructor, so we expose only the safe static parts
    sandbox.Date = {
        now: Date.now,
        parse: Date.parse,
        UTC: Date.UTC,
    };
    // Plain functions — calling .constructor on them gives Function, but since
    // Function("...")() runs in the sandbox (where dangerous globals are absent),
    // this is acceptable. Safer than passing constructor-bearing objects.
    sandbox.parseInt = parseInt;
    sandbox.parseFloat = parseFloat;
    sandbox.isNaN = isNaN;
    sandbox.isFinite = isFinite;
    // Explicitly shadow dangerous globals so they're undefined
    sandbox.setTimeout = undefined;
    sandbox.setInterval = undefined;
    sandbox.clearTimeout = undefined;
    sandbox.clearInterval = undefined;
    sandbox.require = undefined;
    sandbox.process = undefined;
    sandbox.global = undefined;
    sandbox.globalThis = undefined;
    sandbox.fetch = undefined;
    if (scriptType === "post" && scriptContext.response) {
        sandbox.response = scriptContext.response;
    }
    const wrappedScript = `(function() {\n${scriptSource}\n})()`;
    try {
        const script = new vm.Script(wrappedScript, { filename: `recli-${scriptType}.js` });
        script.runInContext(sandbox, { timeout: 5000 });
    }
    catch (e) {
        if (e instanceof AssertionError) {
            throw new ScriptError(`Assertion failed: ${e.message}`, scriptType, scriptSource);
        }
        const msg = e instanceof Error ? e.message : String(e);
        throw new ScriptError(msg, scriptType, scriptSource);
    }
}
function createSandboxConsole() {
    return {
        log: (...args) => console.log(`[script]`, ...args),
        warn: (...args) => console.warn(`[script]`, ...args),
        error: (...args) => console.error(`[script]`, ...args),
        info: (...args) => console.info(`[script]`, ...args),
    };
}
// Sort object keys recursively for stable deep comparison
function sortKeys(o) {
    if (o === null || o === undefined)
        return o;
    if (Array.isArray(o))
        return o.map(sortKeys);
    if (typeof o === "object") {
        const sorted = {};
        for (const k of Object.keys(o).sort()) {
            sorted[k] = sortKeys(o[k]);
        }
        return sorted;
    }
    return o;
}
function createExpectFunction() {
    return function expect(actual) {
        return {
            toBe(expected) {
                if (actual !== expected) {
                    throw new AssertionError(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
                }
            },
            toEqual(expected) {
                const a = JSON.stringify(sortKeys(actual));
                const b = JSON.stringify(sortKeys(expected));
                if (a !== b) {
                    throw new AssertionError(`expected ${b}, got ${a}`);
                }
            },
            toContain(expected) {
                const str = String(actual);
                if (!str.includes(expected)) {
                    throw new AssertionError(`expected "${str}" to contain "${expected}"`);
                }
            },
            toBeGreaterThan(expected) {
                if (typeof actual !== "number" || actual <= expected) {
                    throw new AssertionError(`expected ${actual} to be greater than ${expected}`);
                }
            },
            toBeLessThan(expected) {
                if (typeof actual !== "number" || actual >= expected) {
                    throw new AssertionError(`expected ${actual} to be less than ${expected}`);
                }
            },
            toMatch(regex) {
                if (!regex.test(String(actual))) {
                    throw new AssertionError(`expected "${actual}" to match ${regex}`);
                }
            },
        };
    };
}
//# sourceMappingURL=scripting.js.map