import type { ExportBundle, RunResult, RunnerOptions, RequestItem } from "./types.js";
export declare function executeRequest(request: RequestItem, envVars: Map<string, string>, timeoutMs: number): Promise<RunResult>;
export declare function flattenRequests(bundle: ExportBundle): RequestItem[];
export declare function runCollection(bundle: ExportBundle, options: RunnerOptions): Promise<RunResult[]>;
//# sourceMappingURL=runner.d.ts.map