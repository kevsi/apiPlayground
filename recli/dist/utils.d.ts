/**
 * Shared CLI utilities.
 *
 * - `toCurl` / `countRequests`: small helpers used by the export command.
 * - `resolveOpts` / `ResolvedOpts`: merges Commander.js options with values
 *   from the project config (recli.config.* / .reclirc).
 * - `emitResults`: dispatches results to the configured reporter (cli, json,
 *   junit, html) and writes to disk when --output is set.
 * - `loadResultsFile`: reads NDJSON or JSON result files for the diff command.
 * - `simpleBodyDiff`: short diff summary for the diff command.
 */
import chalk from "chalk";
import type { Command } from "commander";
import type { ExportBundle, RunResult } from "./types.js";
export type { ExportBundle, RunResult };
export interface ResolvedOpts {
    env?: string;
    timeout: string;
    color: boolean;
    json: boolean;
    parallel: boolean;
    delay: number;
    iterations: number;
    data?: string;
    reporter?: string;
    output?: string;
    snapshot?: boolean;
    updateSnapshots?: boolean;
    dotenv?: string;
}
export declare function toCurl(req: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
}): string;
export declare function countRequests(bundle: ExportBundle): number;
export declare function resolveOpts(prog: Command): ResolvedOpts;
export declare function emitResults(results: RunResult[], opts: ResolvedOpts): Promise<void>;
export declare function loadResultsFile(fp: string): RunResult[];
export declare function simpleBodyDiff(before?: string, after?: string): string;
/**
 * Reads a JSON file from disk, exiting the process on parse errors.
 * Used by commands that consume ExportBundle files.
 */
export declare function readBundleOrExit(filePath: string): ExportBundle;
/** Expose chalk via utils so command files don't need to import it directly. */
export { chalk };
//# sourceMappingURL=utils.d.ts.map