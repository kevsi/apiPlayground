/**
 * `recli validate <file>` — validate an exported JSON collection file.
 *
 * Also handles `init [name]`, `export <file>` and `watch <file>` since they
 * are short file-manipulation commands that fit thematically.
 */
import type { Command } from "commander";
export declare function registerValidate(program: Command): void;
export declare function registerInit(program: Command): void;
export declare function registerExport(program: Command): void;
export declare function registerWatch(program: Command): void;
//# sourceMappingURL=validate.d.ts.map