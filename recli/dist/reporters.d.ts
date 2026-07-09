import type { RunResult } from "./types.js";
export declare function reportCLI(results: RunResult[]): void;
export declare function reportJSON(results: RunResult[]): string;
export declare function buildJUnit(results: RunResult[]): string;
export declare function buildHTML(results: RunResult[]): string;
export declare function writeReport(content: string, outputPath: string): void;
export declare function printSummary(results: RunResult[], json: boolean): void;
export declare function printError(msg: string): void;
//# sourceMappingURL=reporters.d.ts.map