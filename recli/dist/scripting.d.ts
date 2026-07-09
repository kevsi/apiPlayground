import type { RunnerContext, RequestItem, RunResult } from "./types.js";
interface EnvAPI {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    unset(key: string): void;
}
interface VarsAPI {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    unset(key: string): void;
}
interface RequestAPI {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    setHeader(key: string, value: string): void;
    setMethod(method: string): void;
    setUrl(url: string): void;
    setBody(body: string): void;
}
interface ResponseAPI {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body?: string;
    json(): unknown;
    text(): string;
    headersAsObject(): Record<string, string>;
}
export interface ScriptContext {
    env: EnvAPI;
    vars: VarsAPI;
    request: RequestAPI;
    response?: ResponseAPI;
}
export declare class ScriptError extends Error {
    scriptType: "pre" | "post";
    scriptSource: string;
    constructor(message: string, scriptType: "pre" | "post", scriptSource: string);
}
export declare class AssertionError extends Error {
    constructor(message: string);
}
export declare function createScriptContext(ctx: RunnerContext, request: RequestItem, result?: RunResult): ScriptContext;
export declare function executeScript(scriptSource: string, scriptContext: ScriptContext, scriptType: "pre" | "post"): void;
export {};
//# sourceMappingURL=scripting.d.ts.map