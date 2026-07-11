/**
 * `recli diff <before> <after>` — compare two result JSON files.
 *
 * Matching is done by request name (not index) so reordering requests in a
 * collection does not produce false positives.
 */
import type { Command } from "commander";
export declare function registerDiff(program: Command): void;
//# sourceMappingURL=diff.d.ts.map