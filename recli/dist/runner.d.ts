import type { ExportBundle, RunResult, RunnerOptions, RunnerContext, RequestItem } from "./types.js";
export declare function executeRequest(request: RequestItem, ctx: RunnerContext, timeoutMs: number, options?: RunnerOptions): Promise<RunResult>;
export declare function flattenRequests(bundle: ExportBundle, requestFilter?: string): RequestItem[];
export declare function runCollection(bundle: ExportBundle, options: RunnerOptions): Promise<RunResult[]>;
export declare function runWorkspace(filePaths: string[], options: RunnerOptions): Promise<RunResult[]>;
//# sourceMappingURL=runner.d.ts.map