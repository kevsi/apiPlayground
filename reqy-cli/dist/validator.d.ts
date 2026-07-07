import type { ExportBundle } from "./types.js";
export interface ValidationError {
    path: string;
    message: string;
}
export declare function validateExportBundle(data: unknown): ValidationError[];
export declare function isValidExportBundle(data: unknown): data is ExportBundle;
//# sourceMappingURL=validator.d.ts.map